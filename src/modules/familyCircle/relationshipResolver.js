/**
 * Authoritative Server-Side Family Relationship Resolver Engine
 * Spoken Odyssey — Phase 0 & Master Integration Prompt Compliant
 */

// Canonical Supported Codes & Display Labels
const RELATIONSHIP_DICTIONARY = {
  FATHER: { label: "Father", defaultSide: "DIRECT" },
  MOTHER: { label: "Mother", defaultSide: "DIRECT" },
  SON: { label: "Son", defaultSide: "DIRECT" },
  DAUGHTER: { label: "Daughter", defaultSide: "DIRECT" },
  CHILD: { label: "Child", defaultSide: "DIRECT" },
  PARENT: { label: "Parent", defaultSide: "DIRECT" },
  BROTHER: { label: "Brother", defaultSide: "DIRECT" },
  SISTER: { label: "Sister", defaultSide: "DIRECT" },
  SIBLING: { label: "Sibling", defaultSide: "DIRECT" },
  HUSBAND: { label: "Husband", defaultSide: "IN_LAW" },
  WIFE: { label: "Wife", defaultSide: "IN_LAW" },
  SPOUSE: { label: "Spouse / Partner", defaultSide: "IN_LAW" },

  GRANDFATHER: { label: "Grandfather", defaultSide: "UNSPECIFIED" },
  PATERNAL_GRANDFATHER: { label: "Paternal Grandfather", defaultSide: "PATERNAL" },
  MATERNAL_GRANDFATHER: { label: "Maternal Grandfather", defaultSide: "MATERNAL" },
  GRANDMOTHER: { label: "Grandmother", defaultSide: "UNSPECIFIED" },
  PATERNAL_GRANDMOTHER: { label: "Paternal Grandmother", defaultSide: "PATERNAL" },
  MATERNAL_GRANDMOTHER: { label: "Maternal Grandmother", defaultSide: "MATERNAL" },
  GRANDSON: { label: "Grandson", defaultSide: "DIRECT" },
  GRANDDAUGHTER: { label: "Granddaughter", defaultSide: "DIRECT" },
  GRANDCHILD: { label: "Grandchild", defaultSide: "DIRECT" },

  UNCLE: { label: "Uncle", defaultSide: "UNSPECIFIED" },
  PATERNAL_UNCLE: { label: "Paternal Uncle", defaultSide: "PATERNAL" },
  MATERNAL_UNCLE: { label: "Maternal Uncle", defaultSide: "MATERNAL" },
  AUNT: { label: "Aunt", defaultSide: "UNSPECIFIED" },
  PATERNAL_AUNT: { label: "Paternal Aunt", defaultSide: "PATERNAL" },
  MATERNAL_AUNT: { label: "Maternal Aunt", defaultSide: "MATERNAL" },

  NEPHEW: { label: "Nephew", defaultSide: "UNSPECIFIED" },
  NIECE: { label: "Niece", defaultSide: "UNSPECIFIED" },
  NIBLING: { label: "Nephew / Niece", defaultSide: "UNSPECIFIED" },

  COUSIN: { label: "Cousin", defaultSide: "UNSPECIFIED" },
  PATERNAL_COUSIN: { label: "Paternal Cousin", defaultSide: "PATERNAL" },
  MATERNAL_COUSIN: { label: "Maternal Cousin", defaultSide: "MATERNAL" },

  GUARDIAN: { label: "Guardian / Relative", defaultSide: "DIRECT" },
  MEMBER: { label: "Family Member", defaultSide: "UNSPECIFIED" }
};

// Deterministic Inverse Resolution Mapping Matrix
const INVERSE_MAPPING = {
  FATHER: { MALE: "SON", FEMALE: "DAUGHTER", DEFAULT: "CHILD" },
  MOTHER: { MALE: "SON", FEMALE: "DAUGHTER", DEFAULT: "CHILD" },
  PARENT: { MALE: "SON", FEMALE: "DAUGHTER", DEFAULT: "CHILD" },
  SON: { MALE: "FATHER", FEMALE: "MOTHER", DEFAULT: "PARENT" },
  DAUGHTER: { MALE: "FATHER", FEMALE: "MOTHER", DEFAULT: "PARENT" },
  CHILD: { MALE: "FATHER", FEMALE: "MOTHER", DEFAULT: "PARENT" },

  BROTHER: { MALE: "BROTHER", FEMALE: "SISTER", DEFAULT: "SIBLING" },
  SISTER: { MALE: "BROTHER", FEMALE: "SISTER", DEFAULT: "SIBLING" },
  SIBLING: { MALE: "BROTHER", FEMALE: "SISTER", DEFAULT: "SIBLING" },

  HUSBAND: { FEMALE: "WIFE", DEFAULT: "SPOUSE" },
  WIFE: { MALE: "HUSBAND", DEFAULT: "SPOUSE" },
  SPOUSE: { DEFAULT: "SPOUSE" },

  GRANDFATHER: { MALE: "GRANDSON", FEMALE: "GRANDDAUGHTER", DEFAULT: "GRANDCHILD" },
  PATERNAL_GRANDFATHER: { MALE: "GRANDSON", FEMALE: "GRANDDAUGHTER", DEFAULT: "GRANDCHILD" },
  MATERNAL_GRANDFATHER: { MALE: "GRANDSON", FEMALE: "GRANDDAUGHTER", DEFAULT: "GRANDCHILD" },
  GRANDMOTHER: { MALE: "GRANDSON", FEMALE: "GRANDDAUGHTER", DEFAULT: "GRANDCHILD" },
  PATERNAL_GRANDMOTHER: { MALE: "GRANDSON", FEMALE: "GRANDDAUGHTER", DEFAULT: "GRANDCHILD" },
  MATERNAL_GRANDMOTHER: { MALE: "GRANDSON", FEMALE: "GRANDDAUGHTER", DEFAULT: "GRANDCHILD" },

  UNCLE: { MALE: "NEPHEW", FEMALE: "NIECE", DEFAULT: "NIBLING" },
  PATERNAL_UNCLE: { MALE: "NEPHEW", FEMALE: "NIECE", DEFAULT: "NIBLING" },
  MATERNAL_UNCLE: { MALE: "NEPHEW", FEMALE: "NIECE", DEFAULT: "NIBLING" },
  AUNT: { MALE: "NEPHEW", FEMALE: "NIECE", DEFAULT: "NIBLING" },
  PATERNAL_AUNT: { MALE: "NEPHEW", FEMALE: "NIECE", DEFAULT: "NIBLING" },
  MATERNAL_AUNT: { MALE: "NEPHEW", FEMALE: "NIECE", DEFAULT: "NIBLING" },

  NEPHEW: { DEFAULT: "UNCLE" },
  NIECE: { DEFAULT: "AUNT" },
  COUSIN: { DEFAULT: "COUSIN" },
  PATERNAL_COUSIN: { DEFAULT: "PATERNAL_COUSIN" },
  MATERNAL_COUSIN: { DEFAULT: "MATERNAL_COUSIN" },
  GUARDIAN: { DEFAULT: "GUARDIAN" },
  MEMBER: { DEFAULT: "MEMBER" }
};

/** Normalize string relationship into canonical enum code */
function normalizeRelationshipCode(str) {
  if (!str || typeof str !== "string") return "MEMBER";
  const s = str.trim().toUpperCase();

  // Disambiguated exact matches first (handles spaces and underscores)
  if (s.includes("PATERNAL_GRANDMOTHER") || s.includes("PATERNAL GRANDMOTHER") || (s.includes("DADI") && !s.includes("NANI"))) return "PATERNAL_GRANDMOTHER";
  if (s.includes("MATERNAL_GRANDMOTHER") || s.includes("MATERNAL GRANDMOTHER") || (s.includes("NANI") && !s.includes("DADI"))) return "MATERNAL_GRANDMOTHER";
  if (s.includes("PATERNAL_GRANDFATHER") || s.includes("PATERNAL GRANDFATHER") || (s.includes("DADA") && !s.includes("NANA"))) return "PATERNAL_GRANDFATHER";
  if (s.includes("MATERNAL_GRANDFATHER") || s.includes("MATERNAL GRANDFATHER") || (s.includes("NANA") && !s.includes("DADA"))) return "MATERNAL_GRANDFATHER";

  if (s.includes("PATERNAL_UNCLE") || s.includes("PATERNAL UNCLE") || s.includes("CHACHA")) return "PATERNAL_UNCLE";
  if (s.includes("MATERNAL_UNCLE") || s.includes("MATERNAL UNCLE") || s.includes("MAMOO")) return "MATERNAL_UNCLE";
  if (s.includes("PATERNAL_AUNT") || s.includes("PATERNAL AUNT") || s.includes("PHUPPHO")) return "PATERNAL_AUNT";
  if (s.includes("MATERNAL_AUNT") || s.includes("MATERNAL AUNT") || s.includes("KHALA")) return "MATERNAL_AUNT";

  if (s === "GRANDMOTHER") return "GRANDMOTHER";
  if (s === "GRANDFATHER") return "GRANDFATHER";
  if (s.includes("FATHER")) return "FATHER";
  if (s.includes("MOTHER")) return "MOTHER";
  if (s.includes("PARENT")) return "PARENT";
  if (s.includes("SON")) return "SON";
  if (s.includes("DAUGHTER")) return "DAUGHTER";
  if (s.includes("CHILD")) return "CHILD";
  if (s.includes("BROTHER")) return "BROTHER";
  if (s.includes("SISTER")) return "SISTER";
  if (s.includes("SIBLING")) return "SIBLING";
  if (s.includes("HUSBAND")) return "HUSBAND";
  if (s.includes("WIFE")) return "WIFE";
  if (s.includes("SPOUSE") || s.includes("PARTNER")) return "SPOUSE";
  if (s.includes("UNCLE")) return "UNCLE";
  if (s.includes("AUNT")) return "AUNT";
  if (s.includes("NEPHEW")) return "NEPHEW";
  if (s.includes("NIECE")) return "NIECE";
  if (s.includes("COUSIN")) return "COUSIN";
  if (s.includes("GRANDFATHER")) return "GRANDFATHER";
  if (s.includes("GRANDMOTHER")) return "GRANDMOTHER";
  if (s.includes("GRANDSON")) return "GRANDSON";
  if (s.includes("GRANDDAUGHTER")) return "GRANDDAUGHTER";
  if (s.includes("GUARDIAN")) return "GUARDIAN";
  return "MEMBER";
}

/** Get reverse relationship code based on target user gender */
function getInverseRelationshipCode(code, targetGender = null) {
  const normCode = normalizeRelationshipCode(code);
  const rule = INVERSE_MAPPING[normCode];
  if (!rule) return "MEMBER";

  const genderKey = (targetGender || "").toUpperCase();
  if (genderKey === "MALE" || genderKey === "MAN") return rule.MALE || rule.DEFAULT;
  if (genderKey === "FEMALE" || genderKey === "WOMAN") return rule.FEMALE || rule.DEFAULT;
  return rule.DEFAULT;
}

/** Get human-readable localized label */
function getDisplayLabel(code) {
  const normCode = normalizeRelationshipCode(code);
  return RELATIONSHIP_DICTIONARY[normCode]?.label || "Family Member";
}

/**
 * Resolve perspective relationship between viewer and target user (Gender-Aware)
 */
function resolvePerspectiveRelationship({ viewerId, targetId, edge, directMemberRelationship, targetGender }) {
  if (viewerId === targetId) {
    return {
      code: "SELF",
      displayLabel: "You",
      side: "DIRECT",
      isSelf: true
    };
  }

  if (edge) {
    if (edge.fromUserId === viewerId) {
      // Viewer assigned edge to target -> returns what target is to viewer
      const code = normalizeRelationshipCode(edge.relationshipCode);
      return {
        code,
        displayLabel: getDisplayLabel(code),
        side: edge.side || RELATIONSHIP_DICTIONARY[code]?.defaultSide || "UNSPECIFIED"
      };
    } else if (edge.toUserId === viewerId) {
      // Target assigned edge to viewer -> calculate inverse using target's gender
      const invCode = getInverseRelationshipCode(edge.relationshipCode, targetGender);
      return {
        code: invCode,
        displayLabel: getDisplayLabel(invCode),
        side: edge.side || RELATIONSHIP_DICTIONARY[invCode]?.defaultSide || "UNSPECIFIED"
      };
    }
  }

  // Fallback to directMemberRelationship string
  if (directMemberRelationship && directMemberRelationship !== "Admin" && directMemberRelationship !== "ADMIN") {
    const code = normalizeRelationshipCode(directMemberRelationship);
    return {
      code,
      displayLabel: getDisplayLabel(code),
      side: RELATIONSHIP_DICTIONARY[code]?.defaultSide || "UNSPECIFIED"
    };
  }

  return {
    code: "MEMBER",
    displayLabel: "Family Member",
    side: "UNSPECIFIED"
  };
}

module.exports = {
  RELATIONSHIP_DICTIONARY,
  INVERSE_MAPPING,
  normalizeRelationshipCode,
  getInverseRelationshipCode,
  getDisplayLabel,
  resolvePerspectiveRelationship
};
