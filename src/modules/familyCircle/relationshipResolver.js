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

// 2-Hop Composition Inference Matrix
const TWO_HOP_COMPOSITION = {
  // Viewer -> SON/DAUGHTER (B) -> COUSIN (C) ==> NEPHEW / NIECE
  "SON+COUSIN": { MALE: "NEPHEW", FEMALE: "NIECE", DEFAULT: "NIBLING" },
  "DAUGHTER+COUSIN": { MALE: "NEPHEW", FEMALE: "NIECE", DEFAULT: "NIBLING" },
  "CHILD+COUSIN": { MALE: "NEPHEW", FEMALE: "NIECE", DEFAULT: "NIBLING" },

  // Viewer -> COUSIN (B) -> FATHER/MOTHER (C) ==> UNCLE / AUNT
  "COUSIN+FATHER": { MALE: "PATERNAL_UNCLE", FEMALE: "PATERNAL_AUNT", DEFAULT: "UNCLE" },
  "COUSIN+MOTHER": { MALE: "MATERNAL_UNCLE", FEMALE: "MATERNAL_AUNT", DEFAULT: "AUNT" },
  "COUSIN+PARENT": { MALE: "UNCLE", FEMALE: "AUNT", DEFAULT: "UNCLE" },

  // Viewer -> FATHER (B) -> BROTHER/SISTER (C) ==> UNCLE / AUNT
  "FATHER+BROTHER": { DEFAULT: "PATERNAL_UNCLE" },
  "FATHER+SISTER": { DEFAULT: "PATERNAL_AUNT" },
  "FATHER+SIBLING": { MALE: "PATERNAL_UNCLE", FEMALE: "PATERNAL_AUNT", DEFAULT: "UNCLE" },

  // Viewer -> MOTHER (B) -> BROTHER/SISTER (C) ==> UNCLE / AUNT
  "MOTHER+BROTHER": { DEFAULT: "MATERNAL_UNCLE" },
  "MOTHER+SISTER": { DEFAULT: "MATERNAL_AUNT" },
  "MOTHER+SIBLING": { MALE: "MATERNAL_UNCLE", FEMALE: "MATERNAL_AUNT", DEFAULT: "AUNT" },

  // Viewer -> BROTHER/SISTER (B) -> SON/DAUGHTER (C) ==> NEPHEW / NIECE
  "BROTHER+SON": { DEFAULT: "NEPHEW" },
  "BROTHER+DAUGHTER": { DEFAULT: "NIECE" },
  "BROTHER+CHILD": { MALE: "NEPHEW", FEMALE: "NIECE", DEFAULT: "NIBLING" },
  "SISTER+SON": { DEFAULT: "NEPHEW" },
  "SISTER+DAUGHTER": { DEFAULT: "NIECE" },
  "SISTER+CHILD": { MALE: "NEPHEW", FEMALE: "NIECE", DEFAULT: "NIBLING" },

  // Viewer -> FATHER/MOTHER (B) -> FATHER/MOTHER (C) ==> GRANDFATHER / GRANDMOTHER
  "FATHER+FATHER": { DEFAULT: "PATERNAL_GRANDFATHER" },
  "FATHER+MOTHER": { DEFAULT: "PATERNAL_GRANDMOTHER" },
  "MOTHER+FATHER": { DEFAULT: "MATERNAL_GRANDFATHER" },
  "MOTHER+MOTHER": { DEFAULT: "MATERNAL_GRANDMOTHER" },

  // Viewer -> UNCLE/AUNT (B) -> SON/DAUGHTER (C) ==> COUSIN
  "PATERNAL_UNCLE+SON": { DEFAULT: "PATERNAL_COUSIN" },
  "PATERNAL_UNCLE+DAUGHTER": { DEFAULT: "PATERNAL_COUSIN" },
  "PATERNAL_UNCLE+CHILD": { DEFAULT: "PATERNAL_COUSIN" },
  "MATERNAL_UNCLE+SON": { DEFAULT: "MATERNAL_COUSIN" },
  "MATERNAL_UNCLE+DAUGHTER": { DEFAULT: "MATERNAL_COUSIN" },
  "MATERNAL_UNCLE+CHILD": { DEFAULT: "MATERNAL_COUSIN" },
  "PATERNAL_AUNT+SON": { DEFAULT: "PATERNAL_COUSIN" },
  "PATERNAL_AUNT+DAUGHTER": { DEFAULT: "PATERNAL_COUSIN" },
  "MATERNAL_AUNT+SON": { DEFAULT: "MATERNAL_COUSIN" },
  "MATERNAL_AUNT+DAUGHTER": { DEFAULT: "MATERNAL_COUSIN" },

  // Viewer -> BROTHER/SISTER (B) -> BROTHER/SISTER (C) ==> BROTHER / SISTER
  "BROTHER+BROTHER": { DEFAULT: "BROTHER" },
  "BROTHER+SISTER": { DEFAULT: "SISTER" },
  "SISTER+BROTHER": { DEFAULT: "BROTHER" },
  "SISTER+SISTER": { DEFAULT: "SISTER" }
};

/**
 * Multi-Hop Graph Traversal Engine
 * Infers relationship between viewerId and targetId across intermediate graph nodes (e.g. 2-hop paths)
 */
function inferMultiHopRelationship({ viewerId, targetId, edges = [], targetGender = null }) {
  if (!viewerId || !targetId || viewerId === targetId || !edges || edges.length === 0) return null;

  // 1. Direct edge check
  const directEdge = edges.find(
    (e) => (e.fromUserId === viewerId && e.toUserId === targetId) ||
           (e.fromUserId === targetId && e.toUserId === viewerId)
  );

  if (directEdge) {
    return resolvePerspectiveRelationship({
      viewerId,
      targetId,
      edge: directEdge,
      targetGender
    });
  }

  // 2. 2-Hop Path Discovery: Viewer (A) -> Intermediate (B) -> Target (C)
  const viewerEdges = edges.filter((e) => e.fromUserId === viewerId || e.toUserId === viewerId);

  for (const edge1 of viewerEdges) {
    const intermediateId = edge1.fromUserId === viewerId ? edge1.toUserId : edge1.fromUserId;
    if (intermediateId === targetId) continue;

    // Find edge between intermediateId (B) and targetId (C)
    const edge2 = edges.find(
      (e) => (e.fromUserId === intermediateId && e.toUserId === targetId) ||
             (e.fromUserId === targetId && e.toUserId === intermediateId)
    );

    if (edge2) {
      // Resolve relation R1 (B to Viewer)
      const rel1 = resolvePerspectiveRelationship({
        viewerId,
        targetId: intermediateId,
        edge: edge1
      });

      // Resolve relation R2 (Target to Intermediate)
      const rel2 = resolvePerspectiveRelationship({
        viewerId: intermediateId,
        targetId,
        edge: edge2,
        targetGender
      });

      const key = `${rel1.code}+${rel2.code}`;
      const compositionRule = TWO_HOP_COMPOSITION[key];

      if (compositionRule) {
        const genderKey = (targetGender || "").toUpperCase();
        let code = compositionRule.DEFAULT;
        if (genderKey === "MALE" || genderKey === "MAN") code = compositionRule.MALE || compositionRule.DEFAULT;
        if (genderKey === "FEMALE" || genderKey === "WOMAN") code = compositionRule.FEMALE || compositionRule.DEFAULT;

        return {
          code,
          displayLabel: getDisplayLabel(code),
          side: RELATIONSHIP_DICTIONARY[code]?.defaultSide || "UNSPECIFIED",
          inferred: true,
          viaUserId: intermediateId
        };
      }
    }
  }

  return null;
}

module.exports = {
  RELATIONSHIP_DICTIONARY,
  INVERSE_MAPPING,
  TWO_HOP_COMPOSITION,
  normalizeRelationshipCode,
  getInverseRelationshipCode,
  getDisplayLabel,
  resolvePerspectiveRelationship,
  inferMultiHopRelationship
};
