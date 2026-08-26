require("dotenv").config();
const prisma = require("./src/config/prisma");
const familyService = require("./src/modules/familyCircle/familyCircle.service");
const { resolvePerspectiveRelationship, normalizeRelationshipCode } = require("./src/modules/familyCircle/relationshipResolver");

async function runMvpRelationshipMatrixTest() {
  console.log("===================================================================");
  console.log("   STARTING MVP FAMILY RELATIONSHIP 2-WAY PERSPECTIVE VERIFICATION ");
  console.log("===================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Setup Test Fixture Users
    const fatherUser = await prisma.user.upsert({
      where: { email: "test_father_matrix@odyssey.com" },
      create: { email: "test_father_matrix@odyssey.com", displayName: "Tariq Father", role: "USER" },
      update: {}
    });
    fatherUser.gender = "MALE";

    const motherUser = await prisma.user.upsert({
      where: { email: "test_mother_matrix@odyssey.com" },
      create: { email: "test_mother_matrix@odyssey.com", displayName: "Amina Mother", role: "USER" },
      update: {}
    });
    motherUser.gender = "FEMALE";

    const sonUser = await prisma.user.upsert({
      where: { email: "test_son_matrix@odyssey.com" },
      create: { email: "test_son_matrix@odyssey.com", displayName: "Bilal Son", role: "USER" },
      update: {}
    });
    sonUser.gender = "MALE";

    const daughterUser = await prisma.user.upsert({
      where: { email: "test_daughter_matrix@odyssey.com" },
      create: { email: "test_daughter_matrix@odyssey.com", displayName: "Fatima Daughter", role: "USER" },
      update: {}
    });
    daughterUser.gender = "FEMALE";

    const uncleUser = await prisma.user.upsert({
      where: { email: "test_mamoo_matrix@odyssey.com" },
      create: { email: "test_mamoo_matrix@odyssey.com", displayName: "Usman Mamoo", role: "USER" },
      update: {}
    });
    uncleUser.gender = "MALE";

    const naniUser = await prisma.user.upsert({
      where: { email: "test_nani_matrix@odyssey.com" },
      create: { email: "test_nani_matrix@odyssey.com", displayName: "Zainab Nani", role: "USER" },
      update: {}
    });
    naniUser.gender = "FEMALE";

    const dadiUser = await prisma.user.upsert({
      where: { email: "test_dadi_matrix@odyssey.com" },
      create: { email: "test_dadi_matrix@odyssey.com", displayName: "Khadija Dadi", role: "USER" },
      update: {}
    });
    dadiUser.gender = "FEMALE";

    const circle = await familyService.getOrCreateFamilyCircle({ currentUser: fatherUser });
    console.log(`\n--- TEST SPACE ID: ${circle.id} ---`);

    // TEST MATRIX 1: Father <-> Son
    console.log("\n--- TEST MATRIX 1: Father <-> Son ---");
    const fatherSonEdge = await familyService.upsertRelationshipEdge({
      currentUser: fatherUser,
      familyCircleId: circle.id,
      toUserId: sonUser.id,
      relationshipCode: "SON"
    });

    // View from Father (User A) -> sees Son as "Son"
    const fatherViewSon = resolvePerspectiveRelationship({
      viewerId: fatherUser.id,
      targetId: sonUser.id,
      edge: fatherSonEdge,
      targetGender: sonUser.gender
    });
    assert(fatherViewSon.displayLabel === "Son", `Father views Son -> Label: '${fatherViewSon.displayLabel}' (Expected: 'Son')`);

    // View from Son (User B) -> sees Father as "Father"
    const sonViewFather = resolvePerspectiveRelationship({
      viewerId: sonUser.id,
      targetId: fatherUser.id,
      edge: fatherSonEdge,
      targetGender: fatherUser.gender
    });
    assert(sonViewFather.displayLabel === "Father", `Son views Father -> Inverse Label: '${sonViewFather.displayLabel}' (Expected: 'Father')`);

    // TEST MATRIX 2: Father <-> Daughter
    console.log("\n--- TEST MATRIX 2: Father <-> Daughter ---");
    const fatherDaughterEdge = await familyService.upsertRelationshipEdge({
      currentUser: fatherUser,
      familyCircleId: circle.id,
      toUserId: daughterUser.id,
      relationshipCode: "DAUGHTER"
    });

    const fatherViewDaughter = resolvePerspectiveRelationship({
      viewerId: fatherUser.id,
      targetId: daughterUser.id,
      edge: fatherDaughterEdge,
      targetGender: daughterUser.gender
    });
    assert(fatherViewDaughter.displayLabel === "Daughter", `Father views Daughter -> Label: '${fatherViewDaughter.displayLabel}' (Expected: 'Daughter')`);

    const daughterViewFather = resolvePerspectiveRelationship({
      viewerId: daughterUser.id,
      targetId: fatherUser.id,
      edge: fatherDaughterEdge,
      targetGender: fatherUser.gender
    });
    assert(daughterViewFather.displayLabel === "Father", `Daughter views Father -> Inverse Label: '${daughterViewFather.displayLabel}' (Expected: 'Father')`);

    // TEST MATRIX 3: Mother <-> Son
    console.log("\n--- TEST MATRIX 3: Mother <-> Son ---");
    const motherSonEdge = await familyService.upsertRelationshipEdge({
      currentUser: motherUser,
      familyCircleId: circle.id,
      toUserId: sonUser.id,
      relationshipCode: "SON"
    });

    const motherViewSon = resolvePerspectiveRelationship({
      viewerId: motherUser.id,
      targetId: sonUser.id,
      edge: motherSonEdge,
      targetGender: sonUser.gender
    });
    assert(motherViewSon.displayLabel === "Son", `Mother views Son -> Label: '${motherViewSon.displayLabel}' (Expected: 'Son')`);

    const sonViewMother = resolvePerspectiveRelationship({
      viewerId: sonUser.id,
      targetId: motherUser.id,
      edge: motherSonEdge,
      targetGender: motherUser.gender
    });
    assert(sonViewMother.displayLabel === "Mother", `Son views Mother -> Inverse Label: '${sonViewMother.displayLabel}' (Expected: 'Mother')`);

    // TEST MATRIX 4: Maternal Uncle (Mamoo) <-> Nephew
    console.log("\n--- TEST MATRIX 4: Maternal Uncle <-> Nephew ---");
    const nephewMamooEdge = await familyService.upsertRelationshipEdge({
      currentUser: sonUser,
      familyCircleId: circle.id,
      toUserId: uncleUser.id,
      relationshipCode: "MATERNAL_UNCLE"
    });

    const nephewViewMamoo = resolvePerspectiveRelationship({
      viewerId: sonUser.id,
      targetId: uncleUser.id,
      edge: nephewMamooEdge,
      targetGender: uncleUser.gender
    });
    assert(nephewViewMamoo.displayLabel === "Maternal Uncle", `Nephew views Mamoo -> Label: '${nephewViewMamoo.displayLabel}' (Expected: 'Maternal Uncle')`);

    const mamooViewNephew = resolvePerspectiveRelationship({
      viewerId: uncleUser.id,
      targetId: sonUser.id,
      edge: nephewMamooEdge,
      targetGender: sonUser.gender
    });
    assert(mamooViewNephew.displayLabel === "Nephew", `Mamoo views Nephew -> Inverse Label: '${mamooViewNephew.displayLabel}' (Expected: 'Nephew')`);

    // TEST MATRIX 5: Disambiguation (Dadi vs Nani)
    console.log("\n--- TEST MATRIX 5: Disambiguation (Dadi vs Nani) ---");
    const codeDadi = normalizeRelationshipCode("Paternal Grandmother (Dadi)");
    const codeNani = normalizeRelationshipCode("Maternal Grandmother (Nani)");
    assert(codeDadi === "PATERNAL_GRANDMOTHER", `Dropdown 'Paternal Grandmother (Dadi)' -> '${codeDadi}' (Expected: 'PATERNAL_GRANDMOTHER')`);
    assert(codeNani === "MATERNAL_GRANDMOTHER", `Dropdown 'Maternal Grandmother (Nani)' -> '${codeNani}' (Expected: 'MATERNAL_GRANDMOTHER')`);

    // TEST MATRIX 6: Contradictory Edge Rejection
    console.log("\n--- TEST MATRIX 6: Contradictory Edge Rejection ---");
    let caughtError = null;
    try {
      // sonUser tries to assign fatherUser as SON (while fatherUser already assigned sonUser as SON)
      await familyService.upsertRelationshipEdge({
        currentUser: sonUser,
        familyCircleId: circle.id,
        toUserId: fatherUser.id,
        relationshipCode: "SON"
      });
    } catch (err) {
      caughtError = err;
    }
    assert(caughtError !== null && caughtError.statusCode === 400, "Contradictory relationship edge (both setting each other as Son) rejected with 400 Bad Request");

    // TEST MATRIX 7: Self Relationship Rejection
    console.log("\n--- TEST MATRIX 7: Self Relationship Rejection ---");
    let selfError = null;
    try {
      await familyService.upsertRelationshipEdge({
        currentUser: fatherUser,
        familyCircleId: circle.id,
        toUserId: fatherUser.id,
        relationshipCode: "FATHER"
      });
    } catch (err) {
      selfError = err;
    }
    assert(selfError !== null && selfError.statusCode === 400, "Self relationship edge rejected with 400 Bad Request");

    // TEST MATRIX 8: Multi-Hop Traversal (Wilayat <-> Mudassir <-> Ali)
    console.log("\n--- TEST MATRIX 8: Multi-Hop Traversal (Wilayat <-> Mudassir <-> Ali) ---");
    const cousinUser = await prisma.user.upsert({
      where: { email: "test_ali_cousin@odyssey.com" },
      create: { email: "test_ali_cousin@odyssey.com", displayName: "Ali Cousin", role: "USER" },
      update: {}
    });
    cousinUser.gender = "MALE";

    let cousinMember = await prisma.familyMember.findFirst({
      where: { familyCircleId: circle.id, userId: cousinUser.id }
    });
    if (!cousinMember) {
      await prisma.familyMember.create({
        data: {
          familyCircleId: circle.id,
          userId: cousinUser.id,
          role: "CONTRIBUTOR",
          relationship: "Cousin"
        }
      });
    }

    // 1. Mudassir (sonUser) sets Wilayat (fatherUser) as FATHER
    await familyService.upsertRelationshipEdge({
      currentUser: sonUser,
      familyCircleId: circle.id,
      toUserId: fatherUser.id,
      relationshipCode: "FATHER"
    });

    // 2. Mudassir (sonUser) sets Ali (cousinUser) as COUSIN
    await familyService.upsertRelationshipEdge({
      currentUser: sonUser,
      familyCircleId: circle.id,
      toUserId: cousinUser.id,
      relationshipCode: "COUSIN"
    });

    // Test Multi-Hop Inference: Wilayat (Father) viewing Ali (Cousin) without a direct edge
    const wilayatViewsAli = await familyService.getRelationshipGraph({
      currentUser: fatherUser,
      familyCircleId: circle.id
    });
    const aliNodeForWilayat = wilayatViewsAli.nodes.find(n => n.userId === cousinUser.id);
    assert(aliNodeForWilayat && (aliNodeForWilayat.displayLabel.includes("Nephew") || aliNodeForWilayat.relationshipCode === "NEPHEW" || aliNodeForWilayat.relationshipCode === "NIBLING"), `Wilayat (Father) views Ali (Son's Cousin) via Graph -> Inferred Label: '${aliNodeForWilayat?.displayLabel}' (Expected: 'Nephew' or 'Nephew / Niece')`);

    // Test Multi-Hop Inference: Ali (Cousin) viewing Wilayat (Father) without a direct edge
    const aliViewsWilayat = await familyService.getRelationshipGraph({
      currentUser: cousinUser,
      familyCircleId: circle.id
    });
    const wilayatNodeForAli = aliViewsWilayat.nodes.find(n => n.userId === fatherUser.id);
    assert(wilayatNodeForAli && (wilayatNodeForAli.displayLabel === "Paternal Uncle" || wilayatNodeForAli.displayLabel === "Uncle" || wilayatNodeForAli.relationshipCode === "PATERNAL_UNCLE" || wilayatNodeForAli.relationshipCode === "UNCLE"), `Ali (Cousin) views Wilayat (Cousin's Father) via Graph -> Inferred Label: '${wilayatNodeForAli?.displayLabel}' (Expected: 'Paternal Uncle' or 'Uncle')`);

  } catch (err) {
    console.error("Test Error:", err);
    failed++;
  } finally {
    console.log("\n===================================================================");
    console.log(`   VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED   `);
    console.log("===================================================================");
    process.exit(failed > 0 ? 1 : 0);
  }
}

runMvpRelationshipMatrixTest();
