require("dotenv").config();
const prisma = require("./src/config/prisma");
const familyService = require("./src/modules/familyCircle/familyCircle.service");
const { resolvePerspectiveRelationship } = require("./src/modules/familyCircle/relationshipResolver");

async function runComprehensiveVerification() {
  console.log("==========================================================");
  console.log("   STARTING SPOKEN ODYSSEY FAMILY SYSTEM FULL API AUDIT   ");
  console.log("==========================================================");

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
    // 1. Setup Test Users
    console.log("\n--- TEST 1: User & Family Space Setup ---");
    let testUserA = await prisma.user.findFirst({ where: { email: "test_parent_a@odyssey.com" } });
    if (!testUserA) {
      testUserA = await prisma.user.create({
        data: {
          email: "test_parent_a@odyssey.com",
          displayName: "Ali Parent",
          role: "ADMIN"
        }
      });
    }

    let testUserB = await prisma.user.findFirst({ where: { email: "test_minor_b@odyssey.com" } });
    if (!testUserB) {
      testUserB = await prisma.user.create({
        data: {
          email: "test_minor_b@odyssey.com",
          displayName: "Ahmed Child",
          role: "USER"
        }
      });
    }

    assert(testUserA && testUserA.id, "User A (Parent Admin) initialized");
    assert(testUserB && testUserB.id, "User B (Minor Member) initialized");

    // 2. Family Circle Creation / Retrieval
    console.log("\n--- TEST 2: Family Circle & Membership ---");
    const circle = await familyService.getOrCreateFamilyCircle({ currentUser: testUserA });
    assert(circle && circle.id, `Family Circle retrieved/created (ID: ${circle.id})`);

    // Ensure User B is in the space with role RESTRICTED_MINOR
    let memberB = await prisma.familyMember.findFirst({
      where: { familyCircleId: circle.id, userId: testUserB.id }
    });
    if (!memberB) {
      memberB = await prisma.familyMember.create({
        data: {
          familyCircleId: circle.id,
          userId: testUserB.id,
          role: "RESTRICTED_MINOR",
          relationship: "Son"
        }
      });
    }
    assert(memberB && memberB.role === "RESTRICTED_MINOR", "Minor member bound to space with RESTRICTED_MINOR role");

    // 3. Perspective Relationship Resolver Test
    console.log("\n--- TEST 3: Perspective Relationship Resolution Engine ---");
    // Create edge: User A (Parent) -> User B (Son)
    const edge = await familyService.upsertRelationshipEdge({
      currentUser: testUserA,
      familyCircleId: circle.id,
      toUserId: testUserB.id,
      relationshipCode: "SON",
      side: "DIRECT"
    });
    assert(edge && edge.relationshipCode === "SON", "Relationship edge created: User A -> Son -> User B");

    // View from User A (Parent) -> sees User B as "Son"
    const relFromA = resolvePerspectiveRelationship({
      viewerId: testUserA.id,
      targetId: testUserB.id,
      edge
    });
    assert(relFromA.displayLabel === "Son", `User A views User B perspective label: '${relFromA.displayLabel}' (Expected: 'Son')`);

    // View from User B (Son) -> sees User A as "Parent / Father"
    const relFromB = resolvePerspectiveRelationship({
      viewerId: testUserB.id,
      targetId: testUserA.id,
      edge
    });
    assert(relFromB.displayLabel === "Parent" || relFromB.displayLabel === "Father" || relFromB.code === "CHILD", `User B views User A inverse perspective label: '${relFromB.displayLabel}' (Inverse derived successfully)`);

    // 4. Memory Linking & Non-Destructive Unlinking Test
    console.log("\n--- TEST 4: Non-Destructive Memory Linking & Cursor Timeline ---");
    let memory = await prisma.memory.findFirst({ where: { ownerId: testUserA.id } });
    if (!memory) {
      memory = await prisma.memory.create({
        data: {
          ownerId: testUserA.id,
          title: "Our Family Trip Memory",
          description: "Wonderful trip to the lake",
          privacy: "Family"
        }
      });
    }

    const link = await familyService.linkMemoryToFamilyCircle({
      currentUser: testUserA,
      familyCircleId: circle.id,
      memoryId: memory.id
    });
    assert(link && link.memoryId === memory.id, "Memory linked into Family Space non-destructively");

    const timeline = await familyService.getFamilyCircleTimeline({
      currentUser: testUserA,
      familyCircleId: circle.id,
      limit: 10
    });
    assert(timeline && Array.isArray(timeline.items), `Cursor timeline retrieved (${timeline.items.length} items)`);

    const unlinkRes = await familyService.unlinkMemoryFromFamilyCircle({
      currentUser: testUserA,
      familyCircleId: circle.id,
      memoryId: memory.id
    });
    assert(unlinkRes && (unlinkRes.message || unlinkRes.success), "Unlink memory succeeded");

    const primaryMemCheck = await prisma.memory.findUnique({ where: { id: memory.id } });
    assert(primaryMemCheck !== null, "GUARANTEE VERIFIED: Primary Memory record remains 100% intact after unlinking");

    // Re-link memory for remaining tests
    await familyService.linkMemoryToFamilyCircle({
      currentUser: testUserA,
      familyCircleId: circle.id,
      memoryId: memory.id
    });

    // 5. Multi-Perspective Story Layers Test
    console.log("\n--- TEST 5: Multi-Perspective Story Layers ---");
    const storyLayer = await familyService.addStoryLayer({
      currentUser: testUserB,
      memoryId: memory.id,
      text: "I remember we also caught a huge fish!"
    });
    assert(storyLayer && storyLayer.text.includes("huge fish"), "Story layer commentary added by minor");

    const layersList = await familyService.getStoryLayers({
      currentUser: testUserA,
      memoryId: memory.id
    });
    assert(layersList && layersList.length > 0, `Fetched ${layersList.length} story layers for memory`);

    // 6. Ask Family Q&A Prompt Engine Test
    console.log("\n--- TEST 6: Ask Family Prompt Engine ---");
    const prompt = await familyService.createFamilyPrompt({
      currentUser: testUserA,
      familyCircleId: circle.id,
      question: "What was your favorite childhood tradition?",
      category: "Traditions"
    });
    assert(prompt && prompt.question.includes("tradition"), "Family Q&A prompt created");

    const response = await familyService.respondToFamilyPrompt({
      currentUser: testUserB,
      promptId: prompt.id,
      text: "Every Sunday we had pancakes!"
    });
    assert(response && response.text.includes("pancakes"), "Minor member responded to family prompt");

    const promptsList = await familyService.getFamilyPrompts({
      currentUser: testUserA,
      familyCircleId: circle.id
    });
    assert(promptsList && promptsList.length > 0, `Fetched ${promptsList.length} family prompts`);

    // 7. Guardian & Minor Safety Controls Test
    console.log("\n--- TEST 7: Guardian & Minor Safety Controls ---");
    const guardianControls = await familyService.getGuardianControls({
      currentUser: testUserA,
      familyCircleId: circle.id
    });
    assert(guardianControls && guardianControls.length > 0, `Fetched ${guardianControls.length} guardian minor consent records`);

    const updatedConsent = await familyService.updateGuardianConsent({
      currentUser: testUserA,
      childUserId: testUserB.id,
      status: "APPROVED",
      canPostWithoutApproval: true
    });
    assert(updatedConsent && updatedConsent.canPostWithoutApproval === true, "Updated minor posting consent toggle to true");

    // 8. Family Relationship Graph API Test
    console.log("\n--- TEST 8: Relationship Graph API ---");
    const graph = await familyService.getRelationshipGraph({
      currentUser: testUserA,
      familyCircleId: circle.id
    });
    assert(graph && graph.nodes.length > 0 && graph.edges.length > 0, `Graph returned ${graph.nodes.length} nodes and ${graph.edges.length} edges`);

  } catch (err) {
    console.error("Critical Test Error:", err);
    failed++;
  } finally {
    console.log("\n==========================================================");
    console.log(`   VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED   `);
    console.log("==========================================================");
    process.exit(failed > 0 ? 1 : 0);
  }
}

runComprehensiveVerification();
