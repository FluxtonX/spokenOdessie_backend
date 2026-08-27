const { retrieveAuthorizedRagContext, buildGroundedHistorianPrompt } = require("./retrieval.service");
const { generateHistorianResponse } = require("./aiProvider.adapter");

/**
 * Ask AI Family Historian
 * 
 * Pipeline:
 * 1. Authenticate user
 * 2. Resolve permission-scoped authorized memories
 * 3. Perform hybrid vector + text retrieval
 * 4. Build grounded RAG prompt
 * 5. Call AI Provider Adapter
 * 6. Return answer + source memory citations
 */
const askFamilyHistorian = async ({ currentUser, message, history = [] }) => {
  if (!message || typeof message !== "string" || !message.trim()) {
    const error = new Error("Message query is required.");
    error.statusCode = 400;
    throw error;
  }

  const query = message.trim();

  // 1. Retrieve Permission-Scoped RAG Context (Entities + Memories + Multi-turn Context)
  const { chunks, sources } = await retrieveAuthorizedRagContext({
    currentUser,
    query,
    history,
    topK: 5
  });

  // STRICT RULE: If NO matching sources/chunks exist for the user's exact query, 
  // return the non-finding answer IMMEDIATELY without hallucinating or calling fallback lists!
  if (sources.length === 0 || chunks.length === 0) {
    console.log(" 🔍 [AI HISTORIAN FORENSIC AUDIT — STEP 3: RESULT]");
    console.log(` • Query: "${query}"`);
    console.log(` • Match Found: FALSE (0 matching chunks in authorized scope)`);
    console.log(` • Final Model Response: "I couldn't find this in your authorized family memories."`);
    console.log("===================================================================\n");

    return {
      answer: "I couldn't find this in your authorized family memories.",
      sourcesCount: 0,
      sources: []
    };
  }

  // 2. Build Grounded System & User Prompt
  const prompt = buildGroundedHistorianPrompt({ query, chunks });

  console.log(" 🔍 [AI HISTORIAN FORENSIC AUDIT — STEP 3: RAG PROMPT SENT TO MODEL]");
  console.log(` • Prompt Text Length: ${prompt.length} chars`);
  console.log(` • Prompt Snippet:`, prompt.substring(0, 300) + "...");

  // 3. Call AI Provider Adapter
  const aiResult = await generateHistorianResponse({
    systemPrompt: "You are the AI Family Historian for Spoken Odyssey.",
    userMessage: prompt,
    maxTokens: 600
  });

  let finalAnswer = aiResult.answer;

  // 4. Grounded Synthesis when OpenAI API Key is unconfigured or offline
  if (!finalAnswer) {
    const mainStory = sources[0];
    const storyText = mainStory.description || mainStory.title;
    const author = mainStory.authorName || "Your family member";
    const dateStr = mainStory.occurredAt ? ` preserved on ${new Date(mainStory.occurredAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : "";

    if (mainStory.type === "family_entity") {
      finalAnswer = `${author} is an authorized member in your family space.\n\n${storyText}`;
    } else if (sources.length === 1) {
      finalAnswer = `According to your family archive, ${author} recorded "${mainStory.title}"${dateStr}.\n\n"${storyText}"\n\nThis memory forms a cherished part of your family history.`;
    } else {
      const extraTitles = sources.slice(1).map(s => `"${s.title}"`).join(" and ");
      finalAnswer = `Based on your family's preserved memories, ${author} shared "${mainStory.title}"${dateStr}:\n\n"${storyText}"\n\nRelated stories in your archive include ${extraTitles}.`;
    }
  }

  console.log(" 🔍 [AI HISTORIAN FORENSIC AUDIT — STEP 4: FINAL MODEL ANSWER]");
  console.log(` • Model Answer: "${finalAnswer}"`);
  console.log("===================================================================\n");

  return {
    answer: finalAnswer,
    sourcesCount: sources.length,
    sources
  };
};

module.exports = {
  askFamilyHistorian
};
