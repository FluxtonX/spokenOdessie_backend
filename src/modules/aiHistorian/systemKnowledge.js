/**
 * Controlled System & Product Knowledge Base for Spoken Odyssey
 * Used to answer product questions accurately without executing private family memory RAG.
 */

const SPOKEN_ODYSSEY_KNOWLEDGE = {
  about: `Spoken Odyssey is a private, multi-generational AI family historian platform designed to preserve, organize, and cherish life stories, voice recordings, videos, family trees, and heritage archives across generations.`,
  
  features: [
    {
      name: "Memories & Multi-Perspective Stories",
      description: "Preserve personal and family moments with text, photos, video recordings, and voice notes. Family members can add 'Story Layers' to contribute their unique perspective to a shared memory."
    },
    {
      name: "Family Circle & Family Tree",
      description: "Connect with parents, children, grandparents, and relatives in a private Family Circle. Visualize family relationships with maternal, paternal, and direct relation links."
    },
    {
      name: "Time Capsule & Vault Locking",
      description: "Lock special memories or voice messages until a future date (such as an 18th birthday, graduation, or milestone anniversary). Locked memories remain securely sealed until their unlock date."
    },
    {
      name: "Digital Legacy & Vault Release",
      description: "Appoint trusted legacy administrators and set release conditions so your preserved life archives and wisdom are safely passed on to future generations."
    },
    {
      name: "AI Family Historian",
      description: "An empathetic conversational AI assistant grounded strictly in your family's authorized memories and recordings. It helps you search, explore, and connect stories preserved in your family archive."
    }
  ],

  faqs: {
    "what is spoken odyssey": "Spoken Odyssey is an AI Family Historian platform that captures, transcribes, and organizes your family's life stories, voice recordings, and heritage memories in a private, multi-generational archive.",
    "how does ai historian work": "In Spoken Odyssey, the AI Family Historian analyzes your authorized family memories, voice transcripts, and relationship connections using permission-scoped RAG (Retrieval-Augmented Generation). It answers questions warmly and accurately based strictly on what your family has recorded.",
    "how do i preserve a memory": "Click the '+ Add Memory' button in your dashboard. You can add a title, description, photos, videos, or record a voice story layer, then choose your privacy settings (Private, Family Circle, or Public).",
    "how does time capsule work": "When creating or editing a memory, enable 'Time Capsule Vault' and pick a future unlock date. The memory content and media will remain securely sealed until that date arrives.",
    "how do i invite family members": "Go to the Family Circle page and click 'Invite Family Member'. You can send an invitation via email or SMS with an assigned family relationship role."
  }
};

/**
 * Resolve Product Knowledge Response for a query
 */
function getSystemKnowledgeResponse(query = "") {
  const clean = query.toLowerCase().trim();

  for (const [key, answer] of Object.entries(SPOKEN_ODYSSEY_KNOWLEDGE.faqs)) {
    if (clean.includes(key)) {
      return answer;
    }
  }

  if (clean.includes("time capsule") || clean.includes("vault")) {
    return `${SPOKEN_ODYSSEY_KNOWLEDGE.faqs["how does time capsule work"]}\n\nTime Capsules ensure your future generations receive your words at the perfect moment.`;
  }

  if (clean.includes("ai historian") || clean.includes("historian")) {
    return `${SPOKEN_ODYSSEY_KNOWLEDGE.faqs["how does ai historian work"]}\n\nIt never invents facts or accesses private memories outside your authorized family circle.`;
  }

  if (clean.includes("preserve") || clean.includes("add memory") || clean.includes("record")) {
    return `${SPOKEN_ODYSSEY_KNOWLEDGE.faqs["how do i preserve a memory"]}`;
  }

  if (clean.includes("invite") || clean.includes("family member") || clean.includes("circle")) {
    return `${SPOKEN_ODYSSEY_KNOWLEDGE.faqs["how do i invite family members"]}`;
  }

  return `${SPOKEN_ODYSSEY_KNOWLEDGE.about}\n\nKey features include:\n• ${SPOKEN_ODYSSEY_KNOWLEDGE.features.map(f => f.name).join("\n• ")}\n\nHow can I help you explore your family's preserved history today?`;
}

module.exports = {
  SPOKEN_ODYSSEY_KNOWLEDGE,
  getSystemKnowledgeResponse
};
