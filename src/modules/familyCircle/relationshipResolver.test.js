const {
  normalizeRelationshipCode,
  getInverseRelationshipCode,
  getDisplayLabel,
  resolvePerspectiveRelationship
} = require("./relationshipResolver");

describe("Family Relationship Resolver Engine", () => {

  test("Normalizes raw relationship strings into canonical codes", () => {
    expect(normalizeRelationshipCode("Maternal Uncle (Mamoo)")).toBe("MATERNAL_UNCLE");
    expect(normalizeRelationshipCode("Paternal Uncle (Chacha)")).toBe("PATERNAL_UNCLE");
    expect(normalizeRelationshipCode("Father")).toBe("FATHER");
    expect(normalizeRelationshipCode("Grandmother (Dadi / Nani)")).toBe("PATERNAL_GRANDMOTHER");
  });

  test("Calculates correct inverse relationships", () => {
    // Father inverse
    expect(getInverseRelationshipCode("FATHER", "MALE")).toBe("SON");
    expect(getInverseRelationshipCode("FATHER", "FEMALE")).toBe("DAUGHTER");

    // Mother inverse
    expect(getInverseRelationshipCode("MOTHER", "MALE")).toBe("SON");
    expect(getInverseRelationshipCode("MOTHER", "FEMALE")).toBe("DAUGHTER");

    // Uncle inverse
    expect(getInverseRelationshipCode("MATERNAL_UNCLE", "MALE")).toBe("NEPHEW");
    expect(getInverseRelationshipCode("PATERNAL_UNCLE", "FEMALE")).toBe("NIECE");

    // Husband / Wife inverse
    expect(getInverseRelationshipCode("HUSBAND", "FEMALE")).toBe("WIFE");
    expect(getInverseRelationshipCode("WIFE", "MALE")).toBe("HUSBAND");
  });

  test("Resolves perspective relationship correctly", () => {
    // Self resolution
    const selfRes = resolvePerspectiveRelationship({
      viewerId: "usr_1",
      targetId: "usr_1"
    });
    expect(selfRes.code).toBe("SELF");
    expect(selfRes.displayLabel).toBe("You");

    // Edge from viewer to target
    const viewerAssignedRes = resolvePerspectiveRelationship({
      viewerId: "usr_1",
      targetId: "usr_2",
      edge: { fromUserId: "usr_1", toUserId: "usr_2", relationshipCode: "FATHER" }
    });
    expect(viewerAssignedRes.code).toBe("FATHER");
    expect(viewerAssignedRes.displayLabel).toBe("Father");

    // Edge from target to viewer (Inverse calculated for viewer)
    const targetAssignedRes = resolvePerspectiveRelationship({
      viewerId: "usr_1",
      targetId: "usr_2",
      edge: { fromUserId: "usr_2", toUserId: "usr_1", relationshipCode: "FATHER" }
    });
    expect(targetAssignedRes.code).toBe("CHILD");
    expect(targetAssignedRes.displayLabel).toBe("Child");
  });
});
