const { retrieveAuthorizedRagContext, buildGroundedHistorianPrompt } = require("./retrieval.service");
const { generateHistorianResponse } = require("./aiProvider.adapter");
const { classifyQueryIntent, getDirectIntentResponse } = require("./intentRouter.service");
const { getSystemKnowledgeResponse } = require("./systemKnowledge");

/**
 * Ask AI Family Historian
 * 
 * Pipeline:
 * 1. Authenticate user & classify query intent
 * 2. Handle CONVERSATIONAL, SPOKEN_ODYSSEY_HELP, OUT_OF_SCOPE directly
 * 3. For FAMILY_KNOWLEDGE: resolve permission-scoped authorized memories & perform hybrid RAG
 * 4. Build grounded RAG prompt & call AI Provider Adapter
 * 5. Return answer + source memory citations
 */
const askFamilyHistorian = async ({ currentUser, message, history = [] }) => {
  if (!message || typeof message !== "string" || !message.trim()) {
    const error = new Error("Message query is required.");
    error.statusCode = 400;
    throw error;
  }

  const query = message.trim();
  const userName = currentUser?.displayName || currentUser?.email?.split("@")[0] || "there";

  // 1. Classify Query Intent
  const intentObj = classifyQueryIntent(query);
  const intent = typeof intentObj === "object" ? intentObj.intent : intentObj;
  console.log(` 🔍 [AI HISTORIAN INTENT ROUTER] Query: "${query}" -> Classified Intent: ${intent}`);

  // 2. Handle Non-RAG Intents Immediately
  if (intent === "CONVERSATIONAL" || intent === "OUT_OF_SCOPE") {
    const directAnswer = getDirectIntentResponse(intentObj, query, userName);
    return {
      answer: directAnswer,
      intent,
      sourcesCount: 0,
      sources: []
    };
  }

  if (intent === "SPOKEN_ODYSSEY_HELP") {
    const helpAnswer = getSystemKnowledgeResponse(query);
    return {
      answer: helpAnswer,
      intent,
      sourcesCount: 0,
      sources: []
    };
  }

  // 3. Handle FAMILY_KNOWLEDGE & PERSON_ENTITY_LOOKUP Intents via Permission-Scoped RAG Context
  const { chunks, sources } = await retrieveAuthorizedRagContext({
    currentUser,
    query,
    history,
    intentObj,
    topK: intent === "PERSON_ENTITY_LOOKUP" ? 2 : 3
  });

  // STRICT RULE: If NO matching sources/chunks exist for the user's query, return non-finding answer
  if (sources.length === 0 || chunks.length === 0) {
    console.log(" 🔍 [AI HISTORIAN RAG RESULT — NO MATCH]");
    console.log(` • Query: "${query}"`);
    console.log(` • Match Found: FALSE (0 matching chunks in authorized scope)`);
    console.log("===================================================================\n");

    return {
      answer: "I couldn't find this in your authorized family memories.",
      intent,
      sourcesCount: 0,
      sources: []
    };
  }

  // 4. Handle Direct PERSON_ENTITY_LOOKUP Response Synthesis
  if (intent === "PERSON_ENTITY_LOOKUP") {
    const entitySource = sources.find(s => s.type === "family_entity") || sources[0];
    const personName = entitySource.authorName || (entitySource.title ? entitySource.title.replace("Family Member: ", "") : "This family member");
    
    // Filter memory stories that actually belong to or tag this person
    const personMemories = sources.filter(s => s.type !== "family_entity" && (s.authorName?.toLowerCase().includes(personName.toLowerCase()) || personName.toLowerCase().includes(s.authorName?.toLowerCase())));

    let entityAnswer = "";
    if (personMemories.length > 0) {
      const titles = personMemories.map(s => `"${s.title}"`).join(" and ");
      entityAnswer = `${personName} is a verified member in your family circle. I found preserved memories associated with them, including ${titles}.\n\nWould you like me to tell you more about these memories?`;
    } else {
      const detailStr = entitySource.description || `${personName} is a registered member in your family circle.`;
      entityAnswer = `${personName} is a verified member in your Spoken Odyssey family circle.\n\n${detailStr}\n\nCurrently, there are no preserved memories or voice recordings uploaded by or tagging ${personName} in your family archive.`;
    }

    return {
      answer: entityAnswer,
      intent,
      sourcesCount: sources.length,
      sources
    };
  }

  // 5. Build Grounded System & User Prompt
  const prompt = buildGroundedHistorianPrompt({ query, chunks });

  console.log(" 🔍 [AI HISTORIAN RAG PROMPT SENT TO MODEL]");
  console.log(` • Prompt Text Length: ${prompt.length} chars`);
  console.log(` • Prompt Snippet:`, prompt.substring(0, 300) + "...");

  // 6. Call AI Provider Adapter
  const aiResult = await generateHistorianResponse({
    systemPrompt: "You are the empathetic, wise, and respectful AI Family Historian for Spoken Odyssey.",
    userMessage: prompt,
    maxTokens: 600
  });

  let finalAnswer = aiResult.answer;

  // 7. Grounded Synthesis Fallback when OpenAI API Key is unconfigured or offline
  if (!finalAnswer) {
    const queryClean = query.toLowerCase().replace(/'s\b/gi, "").replace(/[^a-z0-9]/g, " ");
    const stopWordsSet = new Set(["what", "when", "where", "which", "about", "tell", "from", "with", "your", "that", "this", "have", "grandpa", "grandfather", "grandmother", "family", "memory", "stories", "story", "happened", "occurred", "recording", "recorded", "said", "spoke", "data", "info", "details", "give"]);
    
    const mainSubjectStems = queryClean
      .split(/\s+/)
      .filter(w => w.length >= 3 && !stopWordsSet.has(w))
      .map(w => w.slice(0, 5));
    
    const allContextText = (chunks.join(" ") + " " + sources.map(s => (s.title || "") + " " + (s.description || "")).join(" ")).toLowerCase();
    const hasRelevance = mainSubjectStems.length === 0 || mainSubjectStems.some(stem => allContextText.includes(stem));

    const specificTopicTerms = queryClean.split(/\s+/).filter(w => ["capsule", "vault", "locked", "recipe", "secret", "2035"].includes(w));
    const hasSpecificTopicMismatch = specificTopicTerms.length > 0 && !specificTopicTerms.some(term => allContextText.includes(term.slice(0, 4)));

    if (!hasRelevance || hasSpecificTopicMismatch) {
      finalAnswer = "I couldn't find this in your authorized family memories.";
    } else {
      const entitySource = sources.find(s => s.type === "family_entity");
      const memoryStories = sources.filter(s => s.type !== "family_entity");

      if (entitySource && memoryStories.length === 0) {
        const author = entitySource.authorName || "This family member";
        finalAnswer = `${author} is an authorized member in your family circle.\n\n${entitySource.description || ''}\n\nCurrently, there are no preserved memories uploaded by ${author} in your family archive.`;
      } else {
        // Find the story whose chunk actually matches the main query terms
        const relevantStory = memoryStories.find(s => {
          const matchingChunk = chunks.find(c => (s.id && c.includes(s.id)) || (s.title && c.includes(s.title)));
          return matchingChunk && mainSubjectStems.some(stem => matchingChunk.toLowerCase().includes(stem));
        }) || memoryStories[0] || sources[0];

        const matchedChunk = chunks.find(c => (relevantStory.id && c.includes(relevantStory.id)) || (relevantStory.title && c.includes(relevantStory.title))) || chunks[0] || "";
        const storyText = (matchedChunk && matchedChunk.length > 30) 
          ? matchedChunk.replace(/\[Preserved Memory ID:.*?\]\n?/, "").trim() 
          : (relevantStory.description || relevantStory.title);

        const author = relevantStory.authorName || "Your family member";
        const dateStr = relevantStory.occurredAt ? ` preserved on ${new Date(relevantStory.occurredAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : "";

        if (relevantStory.type === "family_entity") {
          finalAnswer = `${author} is an authorized member in your family space.\n\n${storyText}`;
        } else if (memoryStories.length === 1) {
          finalAnswer = `According to your family archive, ${author} recorded "${relevantStory.title}"${dateStr}.\n\n"${storyText}"\n\nThis memory forms a cherished part of your family history.`;
        } else {
          const extraStories = memoryStories.filter(s => s.id !== relevantStory.id);
          const extraTitles = extraStories.map(s => `"${s.title}"`).join(" and ");
          finalAnswer = `Based on your family's preserved memories, ${author} shared "${relevantStory.title}"${dateStr}:\n\n"${storyText}"${extraTitles ? `\n\nRelated stories in your archive include ${extraTitles}.` : ''}`;
        }
      }
    }
  }

  console.log(" 🔍 [AI HISTORIAN FINAL MODEL ANSWER]");
  console.log(` • Model Answer: "${finalAnswer}"`);
  console.log("===================================================================\n");

  return {
    answer: finalAnswer,
    intent,
    sourcesCount: sources.length,
    sources
  };
};

module.exports = {
  askFamilyHistorian
};

