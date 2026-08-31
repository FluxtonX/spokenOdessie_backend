/**
 * Intent Router Service for AI Family Historian
 * Categorizes user queries into 4 distinct intents:
 * 1. CONVERSATIONAL
 * 2. SPOKEN_ODYSSEY_HELP
 * 3. FAMILY_KNOWLEDGE
 * 4. OUT_OF_SCOPE
 */

const GREETINGS_PATTERNS = [
  /^(hello|hi|hey|greetings|good morning|good afternoon|good evening|howdy|hi there|hello there)\b/i,
  /^(thanks|thank you|thanks a lot|thank you so much|appreciate it)\b/i,
  /^(what can you do|what are your capabilities|who are you|how can you help me)\b/i
];

const SPOKEN_ODYSSEY_HELP_PATTERNS = [
  /\b(spoken odyssey|how does time capsule work|how to preserve|how do i preserve|how to record|how to add family|how to invite|what is time capsule|how does vault work)\b/i,
  /\b(how does ai historian work|what can ai historian do|how to create memory|how to upload video|how to add story layer)\b/i
];

const OUT_OF_SCOPE_PATTERNS = [
  /\b(what is python|who is einstein|who was einstein|capital of|weather today|write code|javascript syntax|quantum physics|translate to french|recipe for pizza)\b/i,
  /\b(tell me a joke about programming|who won the super bowl|stock market|crypto price)\b/i
];

/**
 * Classify Query Intent
 * Returns { intent, entityName }
 */
function classifyQueryIntent(query = "") {
  if (!query || typeof query !== "string") {
    return { intent: "CONVERSATIONAL", entityName: null };
  }

  const clean = query.trim().toLowerCase();

  // 1. Check Conversational Greetings
  if (clean.length < 20) {
    for (const pattern of GREETINGS_PATTERNS) {
      if (pattern.test(clean)) {
        return { intent: "CONVERSATIONAL", entityName: null };
      }
    }
  }

  // 2. Check Direct Person Entity Lookups FIRST (e.g., "give me data about Ai User", "who is Mu Safi")
  const personMatch = clean.match(/^(who is|who was|tell me about|who\'s|give me data about|give me info about|data about|info about|details of|search for|details about)\s+([a-z0-9\s]+)\??$/i);
  if (personMatch) {
    const targetName = personMatch[2].trim();
    if (!/\b(birthday|recording|capsule|story|memory|history|spoken odyssey)\b/i.test(targetName)) {
      return { intent: "PERSON_ENTITY_LOOKUP", entityName: targetName };
    }
  }

  // 3. Check Spoken Odyssey Product & Platform Help Questions
  for (const pattern of SPOKEN_ODYSSEY_HELP_PATTERNS) {
    if (pattern.test(clean)) {
      return { intent: "SPOKEN_ODYSSEY_HELP", entityName: null };
    }
  }

  if (clean.includes("what is spoken odyssey") || clean.includes("about spoken odyssey")) {
    return { intent: "SPOKEN_ODYSSEY_HELP", entityName: null };
  }

  // 3. Check Out-of-Scope Queries
  for (const pattern of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(clean)) {
      return { intent: "OUT_OF_SCOPE", entityName: null };
    }
  }

  // 4. Check Single-Word or Direct Person Entity Lookups
  const words = clean.split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);

  if (words.length === 1 && !["hello", "hi", "thanks", "help", "who", "what", "where", "when", "why"].includes(words[0])) {
    return { intent: "PERSON_ENTITY_LOOKUP", entityName: words[0] };
  }

  // 5. Check Recording / Speech Questions
  if (/\b(recording|say|said|audio|transcript|voice|video|spoke|words)\b/i.test(clean)) {
    return { intent: "RECORDING_QUESTION", entityName: null };
  }

  // 6. Check Specific Memory Questions
  if (/\b(birthday|gathering|wedding|anniversary|trip|celebration|event|hangu|capsule)\b/i.test(clean)) {
    return { intent: "SPECIFIC_MEMORY_QUESTION", entityName: null };
  }

  // 7. General Family Knowledge
  return { intent: "FAMILY_KNOWLEDGE", entityName: null };
}

/**
 * Get Pre-cooked Response for Conversational / Out-of-Scope Intent
 */
function getDirectIntentResponse(intentObj, query, userName = "there") {
  const intent = typeof intentObj === "object" ? intentObj.intent : intentObj;

  if (intent === "CONVERSATIONAL") {
    const clean = query.toLowerCase().trim();
    if (clean.includes("thanks") || clean.includes("thank you")) {
      return "You're most welcome! I'm always here to help you explore and cherish your family's preserved history.";
    }
    if (clean.includes("what can you do") || clean.includes("who are you")) {
      return `I am your AI Family Historian for Spoken Odyssey! I can help you discover stories, advice, and voice recordings preserved in your family space, explain how Spoken Odyssey features work, or help you connect details across generations. What would you like to explore today?`;
    }
    return `Hello ${userName}! I am your AI Family Historian. How can I help you explore your family's preserved memories today?`;
  }

  if (intent === "OUT_OF_SCOPE") {
    return `I am specialized as your Spoken Odyssey AI Family Historian, so I focus specifically on your family's preserved memories, voice recordings, relationships, and Spoken Odyssey platform guidance. Feel free to ask me about your family stories, relatives, or preserved recordings!`;
  }

  return null;
}

module.exports = {
  classifyQueryIntent,
  getDirectIntentResponse
};
