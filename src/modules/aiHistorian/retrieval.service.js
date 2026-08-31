const prisma = require("../../config/prisma");
const { getAuthorizedScopeForUser } = require("./permissionScope.service");
const { indexMemoryForRag } = require("./embedding.service");

const STOPWORDS = new Set([
  "who", "what", "where", "when", "why", "how", "is", "are", "was", "were", 
  "the", "a", "an", "of", "in", "on", "at", "to", "for", "and", "or", "it", 
  "this", "that", "tell", "me", "about", "he", "she", "they", "them", "my", 
  "your", "our", "his", "her", "their", "family", "memory", "memories", 
  "story", "stories", "preserved", "context", "show", "did", "say", "know", 
  "anything", "have", "has", "had", "with", "from", "can", "you", "does", "which",
  "ai", "user", "users", "app", "system", "platform", "bot", "assistant", "profile", "account", "login", "dashboard"
]);

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
const retrieveAuthorizedRagContext = async ({ currentUser, query, history = [], intentObj = {}, topK = 3 }) => {
  if (!query || typeof query !== "string") {
    return { chunks: [], sources: [] };
  }

  const intent = typeof intentObj === "object" ? intentObj.intent : intentObj;
  const targetEntityName = typeof intentObj === "object" ? intentObj.entityName : null;

  const contextualizedQuery = contextualizeQuery(query, history);
  const currentUserId = currentUser?.id || currentUser?.uid || currentUser?.sub || "anonymous";
  const userEmail = currentUser?.email || "";

  // 1. Resolve Authorized Permission Scope for logged-in user
  const { allowedMemoryIds, allowedUserIds, activeCircleIds } = await getAuthorizedScopeForUser(currentUser);

  console.log("\n===================================================================");
  console.log(" 🔍 [AI HISTORIAN RELEVANCE RETRIEVAL — STEP 1: PERMISSION SCOPE]");
  console.log(` • Authenticated User: ID=${currentUserId}, Email=${userEmail}`);
  console.log(` • Intent: ${intent} | Target Entity: ${targetEntityName || "N/A"}`);
  console.log(` • Authorized Family Users: ${allowedUserIds.length} | Authorized Memories: ${allowedMemoryIds.length}`);
  console.log("===================================================================\n");

  if (allowedUserIds.length === 0 && allowedMemoryIds.length === 0) {
    return { chunks: [], sources: [] };
  }

  const searchTarget = targetEntityName || contextualizedQuery;
  const rawTerms = searchTarget.toLowerCase().split(/\s+/).map(t => t.replace(/[^a-z0-9]/gi, "")).filter(Boolean);
  const terms = rawTerms.filter(t => !STOPWORDS.has(t) && t.length >= 3);

  const chunks = [];
  const sourcesMap = new Map();

  // -------------------------------------------------------------------
  // 2. ENTITY SEARCH: Direct Person / Entity Lookup
  // -------------------------------------------------------------------
  let matchedUserIds = [];

  if (allowedUserIds.length > 0) {
    const cleanSearchTarget = (targetEntityName || searchTarget).toLowerCase().replace(/^(give me data about|data about|info about|details of|search for)\s+/i, "").trim();

    // 1. First try exact/closest displayName match
    let matchedUsers = await prisma.user.findMany({
      where: {
        id: { in: allowedUserIds },
        displayName: { contains: cleanSearchTarget, mode: "insensitive" }
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
      take: 5
    });

    // 2. Fallback to term search only if no direct displayName match
    if (matchedUsers.length === 0 && terms.length > 0) {
      const userSearchConditions = terms.map(t => ({ displayName: { contains: t, mode: "insensitive" } }));
      matchedUsers = await prisma.user.findMany({
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
        take: 5
      });
    }

    matchedUserIds = matchedUsers.map(u => u.id);

    console.log(" 🔍 [AI HISTORIAN RELEVANCE RETRIEVAL — STEP 2: ENTITY MATCHES]");
    console.log(` • Matched Authorized Users: ${matchedUsers.length}`, matchedUsers.map(u => ({ id: u.id, name: u.displayName })));
    console.log("===================================================================\n");

    for (const u of matchedUsers) {
      const circleNames = u.familyMemberships.map(m => m.familyCircle?.name).filter(Boolean).join(", ");
      const roles = u.familyMemberships.map(m => `${m.relationship || 'Family Member'} (${m.role || 'Member'})`).join(", ");

      const entityChunk = `[Family Member Profile: "${u.displayName}" | Circle: "${circleNames || 'Family Circle'}" | Role/Relation: "${roles || 'Family Member'}" | Profession: "${u.profession || 'N/A'}" | Bio: "${u.bio || 'N/A'}"]`;
      chunks.push(entityChunk);

      if (!sourcesMap.has(u.id)) {
        sourcesMap.set(u.id, {
          memoryId: u.id,
          id: u.id,
          title: `Family Member: ${u.displayName}`,
          description: u.bio || `${u.displayName} is a verified member in ${circleNames || 'your family circle'}.`,
          authorName: u.displayName,
          type: "family_entity"
        });
      }
    }
  }

  // -------------------------------------------------------------------
  // 3. MEMORY SEARCH: Relevant Memory Records & Transcripts
  // -------------------------------------------------------------------
  if (allowedMemoryIds.length > 0) {
    const memoryWhere = {
      id: { in: allowedMemoryIds }
    };

    // If searching for a specific person, prioritize memories owned by or tagging them
    if (intent === "PERSON_ENTITY_LOOKUP" && matchedUserIds.length > 0) {
      memoryWhere.OR = [
        { ownerId: { in: matchedUserIds } },
        { taggedUserIds: { hasSome: matchedUserIds } }
      ];
    } else {
      const searchConditions = [
        { content: { contains: searchTarget, mode: "insensitive" } }
      ];
      terms.forEach(term => {
        searchConditions.push({ content: { contains: term, mode: "insensitive" } });
      });

      const embeddingDocs = await prisma.embeddingDocument.findMany({
        where: {
          memoryId: { in: allowedMemoryIds },
          OR: searchConditions
        },
        select: { memoryId: true }
      });

      const matchedMemoryIds = Array.from(new Set(embeddingDocs.map(d => d.memoryId)));
      memoryWhere.id = { in: matchedMemoryIds.length > 0 ? matchedMemoryIds : allowedMemoryIds };
    }

    const candidateMemories = await prisma.memory.findMany({
      where: memoryWhere,
      select: {
        id: true,
        title: true,
        description: true,
        occurredAt: true,
        type: true,
        tags: true,
        mood: true,
        mediaKey: true,
        owner: { select: { id: true, displayName: true } },
        mediaAssets: { select: { id: true, transcriptText: true } },
        storyLayers: { select: { id: true, text: true, transcriptText: true } }
      },
      take: 10
    });

    // Score & Rank Memories by Relevance
    const scoredMemories = candidateMemories.map(mem => {
      let score = 0;
      const titleLower = (mem.title || "").toLowerCase();
      const descLower = (mem.description || "").toLowerCase();
      const authorLower = (mem.owner?.displayName || "").toLowerCase();

      const transcripts = [
        ...(mem.mediaAssets || []).map(a => a.transcriptText || ""),
        ...(mem.storyLayers || []).map(l => (l.text || "") + " " + (l.transcriptText || ""))
      ].join(" ").toLowerCase();

      const hasTranscript = transcripts.trim().length > 10;

      // Boost transcript-backed memories for RECORDING_QUESTION intent
      if (intent === "RECORDING_QUESTION" && hasTranscript) {
        score += 120;
      }

      // Entity / Owner Match
      if (matchedUserIds.includes(mem.owner?.id)) score += 60;
      if (terms.some(t => authorLower.includes(t))) score += 50;

      // Title Match
      if (terms.some(t => titleLower.includes(t))) score += 80;

      // Description Match
      if (terms.some(t => descLower.includes(t))) score += 40;

      // Transcript / Story Layer Content Match
      if (terms.some(t => transcripts.includes(t))) score += 35;

      return { mem, score, transcripts };
    }).sort((a, b) => b.score - a.score);

    console.log(" 🔍 [AI HISTORIAN RELEVANCE RETRIEVAL — STEP 3: MEMORY RESULTS]");
    console.log(` • Candidate Memories Scored: ${scoredMemories.length}`, scoredMemories.map(s => ({ title: s.mem.title, score: s.score })));
    console.log("===================================================================\n");

    const effectiveTopK = intent === "PERSON_ENTITY_LOOKUP" ? 2 : topK;

    for (const { mem, transcripts } of scoredMemories.slice(0, effectiveTopK)) {
      const authorName = mem?.owner?.displayName || "Family Member";
      const dateStr = mem?.occurredAt ? new Date(mem.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

      const bodyText = (transcripts && transcripts.length > 20) ? transcripts : (mem.description || mem.title);
      const chunkText = `[Preserved Memory ID: "${mem.id}" | Title: "${mem.title}" | Author: "${authorName}" | Date: "${dateStr}"]\n${bodyText}`;
      chunks.push(chunkText);

      if (!sourcesMap.has(mem.id)) {
        sourcesMap.set(mem.id, {
          memoryId: mem.id,
          id: mem.id,
          title: mem.title,
          description: mem.description || "",
          authorName,
          occurredAt: mem.occurredAt,
          type: mem.type || "Text",
          tags: mem.tags || [],
          mood: mem.mood || "",
          mediaKey: mem.mediaKey || null,
          mediaAssetsCount: (mem.mediaAssets || []).length
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
