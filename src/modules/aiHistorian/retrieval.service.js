const prisma = require("../../config/prisma");
const { getAuthorizedScopeForUser } = require("./permissionScope.service");
const { indexMemoryForRag } = require("./embedding.service");

const STOPWORDS = new Set(["who", "what", "where", "when", "why", "how", "is", "are", "was", "were", "the", "a", "an", "of", "in", "on", "at", "to", "for", "and", "or", "it", "this", "that", "tell", "me", "about", "he", "she", "they", "them"]);

/**
 * Contextualize Follow-up Queries based on Conversation History
 */
function contextualizeQuery(query, history = []) {
  if (!query || typeof query !== "string") return "";
  const cleaned = query.trim();

  // If query is short follow-up like "why?", "tell me more", "who is he?"
  const isFollowUp = cleaned.length < 15 || /^(why|how|who is (he|she|this|that)|tell me more|what else|more details)/i.test(cleaned);

  if (isFollowUp && Array.isArray(history) && history.length > 0) {
    // Look back at recent user/assistant turns to extract main subject/name
    for (let i = history.length - 1; i >= 0; i--) {
      const prevMsg = history[i]?.text || history[i]?.content || "";
      if (prevMsg && prevMsg.length > 3) {
        return `${cleaned} (Context: ${prevMsg})`;
      }
    }
  }

  return cleaned;
}

/**
 * Perform Permission-Scoped Hybrid RAG Retrieval (Entities + Memories)
 */
const retrieveAuthorizedRagContext = async ({ currentUser, query, history = [], topK = 5 }) => {
  if (!query || typeof query !== "string") {
    return { chunks: [], sources: [] };
  }

  const contextualizedQuery = contextualizeQuery(query, history);
  const currentUserId = currentUser?.id || currentUser?.uid || currentUser?.sub || "anonymous";
  const userEmail = currentUser?.email || "";

  // 1. Resolve Authorized Permission Scope for logged-in user
  const { allowedMemoryIds, allowedUserIds, activeCircleIds } = await getAuthorizedScopeForUser(currentUser);
  
  console.log("\n===================================================================");
  console.log(" 🔍 [AI HISTORIAN FORENSIC AUDIT — STEP 1: PERMISSION SCOPE]");
  console.log(` • Authenticated User: ID=${currentUserId}, Email=${userEmail}`);
  console.log(` • Active Family Circle Count: ${activeCircleIds.length}`);
  console.log(` • Authorized Family User Count: ${allowedUserIds.length}`);
  console.log(` • Authorized Memory Count: ${allowedMemoryIds.length}`);
  console.log("===================================================================\n");

  if (allowedUserIds.length === 0 && allowedMemoryIds.length === 0) {
    return { chunks: [], sources: [] };
  }

  // Extract clean search tokens (excluding stopwords)
  const rawTerms = contextualizedQuery.toLowerCase().split(/\s+/).map(t => t.replace(/[^a-z0-9]/gi, "")).filter(Boolean);
  const terms = rawTerms.filter(t => !STOPWORDS.has(t) && t.length >= 2);

  const chunks = [];
  const sourcesMap = new Map();

  // -------------------------------------------------------------------
  // 2. ENTITY SEARCH: Query User, FamilyMember & FamilyRelation DB records
  // -------------------------------------------------------------------
  if (allowedUserIds.length > 0) {
    const userSearchConditions = [
      { displayName: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      { bio: { contains: query, mode: "insensitive" } },
      { profession: { contains: query, mode: "insensitive" } }
    ];

    terms.forEach(t => {
      userSearchConditions.push({ displayName: { contains: t, mode: "insensitive" } });
      userSearchConditions.push({ email: { contains: t, mode: "insensitive" } });
      userSearchConditions.push({ bio: { contains: t, mode: "insensitive" } });
      userSearchConditions.push({ profession: { contains: t, mode: "insensitive" } });
    });

    // A. Search Users in authorized family scope
    const matchedUsers = await prisma.user.findMany({
      where: {
        id: { in: allowedUserIds },
        OR: userSearchConditions
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        profession: true,
        bio: true,
        location: true,
        familyMemberships: {
          where: { familyCircleId: { in: activeCircleIds } },
          select: {
            role: true,
            relationship: true,
            familyCircle: { select: { name: true } }
          }
        }
      },
      take: topK
    });

    // B. Search FamilyMembers in authorized family circles by relationship name
    const memberSearchConditions = terms.map(t => ({ relationship: { contains: t, mode: "insensitive" } }));
    memberSearchConditions.push({ relationship: { contains: query, mode: "insensitive" } });

    const matchedMembers = await prisma.familyMember.findMany({
      where: {
        familyCircleId: { in: activeCircleIds },
        status: "ACTIVE",
        OR: memberSearchConditions
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            profession: true,
            bio: true
          }
        },
        familyCircle: { select: { name: true } }
      },
      take: topK
    });

    // C. Search FamilyRelationshipEdges in authorized family circles
    const edgeSearchConditions = terms.map(t => ({ relationshipCode: { contains: t, mode: "insensitive" } }));
    edgeSearchConditions.push({ relationshipCode: { contains: query, mode: "insensitive" } });

    const matchedEdges = await prisma.familyRelationshipEdge.findMany({
      where: {
        familyCircleId: { in: activeCircleIds },
        OR: edgeSearchConditions
      },
      include: {
        fromUser: { select: { displayName: true } },
        toUser: { select: { displayName: true } }
      },
      take: topK
    });

    console.log(" 🔍 [AI HISTORIAN FORENSIC AUDIT — STEP 2: ENTITY SEARCH RESULTS]");
    console.log(` • Matched Authorized Users in DB: ${matchedUsers.length}`, matchedUsers.map(u => ({ id: u.id, name: u.displayName })));
    console.log(` • Matched Family Member Records in DB: ${matchedMembers.length}`, matchedMembers.map(m => ({ id: m.id, rel: m.relationship, name: m.user?.displayName })));
    console.log(` • Matched Family Relationship Edges in DB: ${matchedEdges.length}`, matchedEdges.map(e => ({ from: e.fromUser?.displayName, rel: e.relationshipCode, to: e.toUser?.displayName })));
    console.log("===================================================================\n");

    // Format Matched Users into Grounded RAG Context Chunks
    for (const u of matchedUsers) {
      const circleNames = u.familyMemberships.map(m => m.familyCircle?.name).filter(Boolean).join(", ");
      const roles = u.familyMemberships.map(m => `${m.relationship} (${m.role})`).join(", ");

      const entityChunk = `[Family Member User Profile: "${u.displayName}" | Email: "${u.email || ''}" | Circle: "${circleNames || 'Family Circle'}" | Role/Relation: "${roles || 'Family Member'}" | Profession: "${u.profession || 'N/A'}" | Bio: "${u.bio || 'N/A'}"]`;
      chunks.push(entityChunk);

      if (!sourcesMap.has(u.id)) {
        sourcesMap.set(u.id, {
          memoryId: u.id,
          title: `Family Member: ${u.displayName}`,
          description: u.bio || `${u.displayName} is a verified family member in ${circleNames || 'your family space'}.`,
          authorName: u.displayName,
          type: "family_entity"
        });
      }
    }

    // Format Matched Members into Grounded RAG Context Chunks
    for (const m of matchedMembers) {
      if (m.user && !sourcesMap.has(m.user.id)) {
        const entityChunk = `[Family Circle Relationship: "${m.user.displayName}" is a ${m.relationship} (${m.role}) in "${m.familyCircle?.name || 'Family Circle'}"]`;
        chunks.push(entityChunk);

        sourcesMap.set(m.user.id, {
          memoryId: m.user.id,
          title: `Family Relation: ${m.user.displayName}`,
          description: `${m.user.displayName} is linked as ${m.relationship} in ${m.familyCircle?.name || 'your family circle'}.`,
          authorName: m.user.displayName,
          type: "family_entity"
        });
      }
    }

    // Format Matched Edges into Grounded RAG Context Chunks
    for (const e of matchedEdges) {
      const edgeChunk = `[Family Relationship Connection: "${e.fromUser?.displayName}" is ${e.relationshipType} "${e.toUser?.displayName}"]`;
      chunks.push(edgeChunk);
    }
  }

  // -------------------------------------------------------------------
  // 3. MEMORY SEARCH: Query EmbeddingDocument & Memory DB records
  // -------------------------------------------------------------------
  if (allowedMemoryIds.length > 0) {
    // Ensure memories are indexed in EmbeddingDocument table
    const unindexedMemories = await prisma.memory.findMany({
      where: {
        id: { in: allowedMemoryIds },
        embeddingDocs: { none: {} }
      },
      select: { id: true }
    });

    if (unindexedMemories.length > 0) {
      for (const mem of unindexedMemories.slice(0, 10)) {
        await indexMemoryForRag(mem.id).catch(() => {});
      }
    }

    const searchConditions = [
      { content: { contains: query, mode: "insensitive" } },
      { content: { contains: contextualizedQuery, mode: "insensitive" } }
    ];
    if (terms.length > 0) {
      terms.forEach(term => {
        searchConditions.push({ content: { contains: term, mode: "insensitive" } });
      });
    }

    const matchedDocs = await prisma.embeddingDocument.findMany({
      where: {
        memoryId: { in: allowedMemoryIds },
        OR: searchConditions
      },
      include: {
        memory: {
          select: {
            id: true,
            title: true,
            description: true,
            occurredAt: true,
            type: true,
            audioUrl: true,
            voiceAssetUrl: true,
            mediaFiles: true,
            privacy: true,
            location: true,
            owner: { select: { id: true, displayName: true, avatarUrl: true } }
          }
        }
      },
      take: Math.min(topK * 2, 20)
    });

    console.log(" 🔍 [AI HISTORIAN FORENSIC AUDIT — STEP 3: MEMORY SEARCH RESULTS]");
    console.log(` • Raw Query: "${query}"`);
    console.log(` • Contextualized Query: "${contextualizedQuery}"`);
    console.log(` • Matching Embedding Memory Chunks Found: ${matchedDocs.length}`);
    if (matchedDocs.length > 0) {
      console.log(` • Retrieved Memory Record IDs:`, matchedDocs.map(d => d.memoryId));
      console.log(` • Retrieved Memory Titles:`, matchedDocs.map(d => d.memory?.title));
    } else {
      console.log(` • Retrieved Memory Record IDs: NONE (0 matching memory records in DB)`);
    }
    console.log("===================================================================\n");

    for (const doc of matchedDocs.slice(0, topK)) {
      const mem = doc.memory;
      const authorName = mem?.owner?.displayName || "Family Member";
      const dateStr = mem?.occurredAt ? new Date(mem.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

      const chunkText = `[Preserved Memory ID: "${mem?.id}" | Title: "${mem?.title || 'Story'}" by ${authorName} on ${dateStr}]\n${doc.content || mem?.description || ""}`;
      chunks.push(chunkText);

      if (mem && !sourcesMap.has(mem.id)) {
        sourcesMap.set(mem.id, {
          ...mem,
          memoryId: mem.id,
          id: mem.id,
          title: mem.title,
          description: mem.description,
          authorName,
          occurredAt: mem.occurredAt,
          type: mem.type,
          audioUrl: mem.audioUrl || mem.voiceAssetUrl,
          mediaFiles: mem.mediaFiles || []
        });
      }
    }
  }

  return {
    chunks,
    sources: Array.from(sourcesMap.values())
  };
};

/**
 * Build Grounded RAG Prompt to Prevent Hallucinations
 */
function buildGroundedHistorianPrompt({ query, chunks }) {
  const contextBlock = chunks.length > 0 ? chunks.join("\n\n---\n\n") : "No specific family entities or memories were found matching this query.";

  return `You are the empathetic, wise, and respectful AI Family Historian for Spoken Odyssey.
Your role is to answer questions about the family's history, members, relationships, and preserved memories.

CRITICAL SECURITY & GROUNDING RULES:
1. Answer ONLY using the retrieved authorized family entities and memories below.
2. DO NOT invent quotes, dates, people, or relationships that are not explicitly present in the retrieved context.
3. If an entity (user/family member) is retrieved, state who they are, their role, and their family connections warmly.
4. If no supporting context exists in the retrieved records, state clearly:
   "I couldn't find this in your authorized family memories."
5. Be warm, respectful, and family-oriented.

RETRIEVED AUTHORIZED FAMILY ENTITIES & MEMORIES:
${contextBlock}

USER QUESTION:
"${query}"

AI FAMILY HISTORIAN RESPONSE:`;
}

module.exports = {
  retrieveAuthorizedRagContext,
  buildGroundedHistorianPrompt
};
