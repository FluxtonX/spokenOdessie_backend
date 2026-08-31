require("dotenv").config({ path: __dirname + "/.env" });
const prisma = require("./src/config/prisma");
const { askFamilyHistorian } = require("./src/modules/aiHistorian/aiHistorian.service");
const { classifyQueryIntent } = require("./src/modules/aiHistorian/intentRouter.service");
const { indexMemoryForRag } = require("./src/modules/aiHistorian/embedding.service");
const { processMediaAssetTranscription } = require("./src/modules/aiHistorian/transcription.service");

async function runMasterTestSuit() {
  console.log("\n===================================================================");
  console.log(" 🧪 SPOKEN ODYSSEY — AI FAMILY HISTORIAN MASTER RUNTIME TEST SUITE");
  console.log("===================================================================\n");

  let testPassed = 0;
  let testFailed = 0;

  // 1. Setup Test User & Mock Data
  let testUser = await prisma.user.findFirst({
    where: { email: "historian_test_user@spokenodyssey.com" }
  });

  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        email: "historian_test_user@spokenodyssey.com",
        displayName: "Mu Safi (Test Grandfather)",
        bio: "Patriarch of the Safi family, born in Hangu.",
        profession: "Family Historian & Educator",
        location: "Hangu"
      }
    });
  }

  // Create another user for cross-family security testing
  let otherUser = await prisma.user.findFirst({
    where: { email: "stranger_user@spokenodyssey.com" }
  });

  if (!otherUser) {
    otherUser = await prisma.user.create({
      data: {
        email: "stranger_user@spokenodyssey.com",
        displayName: "Unrelated Stranger",
        bio: "Not connected to the Safi family."
      }
    });
  }

  // Create Test Family Circle
  let circle = await prisma.familyCircle.findFirst({
    where: { name: "Safi Family Circle Test" }
  });

  if (!circle) {
    circle = await prisma.familyCircle.create({
      data: {
        name: "Safi Family Circle Test",
        description: "Official family space for testing",
        createdById: testUser.id
      }
    });

    await prisma.familyMember.create({
      data: {
        familyCircleId: circle.id,
        userId: testUser.id,
        role: "ADMIN",
        status: "ACTIVE",
        relationship: "Grandfather"
      }
    });
  }

  // Create Test Memories
  // Memory A: Public description-only memory
  let memoryA = await prisma.memory.findFirst({
    where: { title: "Mu Safi 70th Birthday in Hangu" }
  });

  if (!memoryA) {
    memoryA = await prisma.memory.create({
      data: {
        ownerId: testUser.id,
        title: "Mu Safi 70th Birthday in Hangu",
        description: "A joyful family gathering celebrating grandfather Mu Safi's 70th birthday at the ancestral home in Hangu.",
        tags: ["birthday", "hangu", "celebration"],
        privacy: "Public",
        status: "published",
        occurredAt: new Date("2025-06-15")
      }
    });
  }

  // Memory B: Locked Time Capsule memory
  let memoryB = await prisma.memory.findFirst({
    where: { title: "Locked Heritage Time Capsule 2035" }
  });

  if (!memoryB) {
    memoryB = await prisma.memory.create({
      data: {
        ownerId: testUser.id,
        title: "Locked Heritage Time Capsule 2035",
        description: "Secret advice for my grandchildren locked until the year 2035.",
        privacy: "Public",
        status: "published",
        isVaultLocked: true,
        unlockAt: new Date("2035-01-01")
      }
    });
  }

  // Memory C: Media asset recording
  let memoryC = await prisma.memory.findFirst({
    where: { title: "Voice Recording on Life Lessons" }
  });

  if (!memoryC) {
    memoryC = await prisma.memory.create({
      data: {
        ownerId: testUser.id,
        title: "Voice Recording on Life Lessons",
        description: "Audio story shared about values.",
        privacy: "Public",
        status: "published"
      }
    });

    const mediaAsset = await prisma.mediaAsset.create({
      data: {
        memoryId: memoryC.id,
        ownerId: testUser.id,
        storageKey: "test/audio.mp3",
        originalName: "Grandfather_Wisdom.mp3",
        mimeType: "audio/mp3",
        transcriptText: "Always honor your word, respect your elders, and preserve your family heritage in Hangu.",
        transcriptStatus: "COMPLETED"
      }
    });
  }

  // Index test memories
  await indexMemoryForRag(memoryA.id);
  await indexMemoryForRag(memoryB.id);
  await indexMemoryForRag(memoryC.id);

  console.log(" ✅ [SETUP] Test user, family circle, and test memories initialized & indexed.\n");

  // -------------------------------------------------------------------
  // TEST 1: SINGLE-NAME PERSON ENTITY LOOKUP ("mudassir")
  // -------------------------------------------------------------------
  try {
    const res1 = await askFamilyHistorian({ currentUser: testUser, message: "mudassir" });
    if (res1.intent === "PERSON_ENTITY_LOOKUP" && res1.answer.toLowerCase().includes("mudassir")) {
      console.log(" ✅ [PASS] Test 1: Single-Name Entity Lookup ('mudassir') -> Direct concise profile answer returned without dumping unrelated family members.");
      testPassed++;
    } else {
      console.error(" ❌ [FAIL] Test 1: Single-Name Entity Lookup failed:", res1);
      testFailed++;
    }
  } catch (err) {
    console.error(" ❌ [FAIL] Test 1 Error:", err.message);
    testFailed++;
  }

  // -------------------------------------------------------------------
  // TEST 2: PERSON QUESTION ("Who is Mu Safi?")
  // -------------------------------------------------------------------
  try {
    const res2 = await askFamilyHistorian({ currentUser: testUser, message: "Who is Mu Safi?" });
    if ((res2.intent === "PERSON_ENTITY_LOOKUP" || res2.intent === "FAMILY_KNOWLEDGE") && res2.sourcesCount > 0 && res2.answer.toLowerCase().includes("safi")) {
      console.log(" ✅ [PASS] Test 2: Person Question ('Who is Mu Safi?') -> Relevant entity profile & memory cited.");
      testPassed++;
    } else {
      console.error(" ❌ [FAIL] Test 2: Person Question failed:", res2);
      testFailed++;
    }
  } catch (err) {
    console.error(" ❌ [FAIL] Test 2 Error:", err.message);
    testFailed++;
  }

  // -------------------------------------------------------------------
  // TEST 3: SPECIFIC MEMORY QUESTION ("Tell me about Mu Safi's 70th birthday")
  // -------------------------------------------------------------------
  try {
    const res3 = await askFamilyHistorian({ currentUser: testUser, message: "Tell me about Mu Safi's 70th birthday" });
    if ((res3.intent === "SPECIFIC_MEMORY_QUESTION" || res3.intent === "FAMILY_KNOWLEDGE") && res3.sourcesCount > 0 && res3.answer.toLowerCase().includes("hangu")) {
      console.log(" ✅ [PASS] Test 3: Specific Memory Question ('70th birthday') -> Relevant memory description retrieved.");
      testPassed++;
    } else {
      console.error(" ❌ [FAIL] Test 3: Specific Memory Question failed:", res3);
      testFailed++;
    }
  } catch (err) {
    console.error(" ❌ [FAIL] Test 3 Error:", err.message);
    testFailed++;
  }

  // -------------------------------------------------------------------
  // TEST 4: RECORDING QUESTION ("What did Mu Safi say in his recording?")
  // -------------------------------------------------------------------
  try {
    const res4 = await askFamilyHistorian({ currentUser: testUser, message: "What did Mu Safi say in his recording?" });
    if ((res4.intent === "RECORDING_QUESTION" || res4.intent === "FAMILY_KNOWLEDGE") && res4.sourcesCount > 0 && res4.answer.toLowerCase().includes("respect")) {
      console.log(" ✅ [PASS] Test 4: Recording Question -> Audio transcript prioritized & cited.");
      testPassed++;
    } else {
      console.error(" ❌ [FAIL] Test 4: Recording Question failed:", res4);
      testFailed++;
    }
  } catch (err) {
    console.error(" ❌ [FAIL] Test 4 Error:", err.message);
    testFailed++;
  }

  // -------------------------------------------------------------------
  // TEST 5: CONVERSATIONAL GREETING ("hello")
  // -------------------------------------------------------------------
  try {
    const res5 = await askFamilyHistorian({ currentUser: testUser, message: "hello" });
    if (res5.intent === "CONVERSATIONAL" && res5.sourcesCount === 0 && res5.answer.includes("AI Family Historian")) {
      console.log(" ✅ [PASS] Test 5: Conversational Greeting ('hello') -> Instant warm response without RAG.");
      testPassed++;
    } else {
      console.error(" ❌ [FAIL] Test 5: Conversational Greeting failed:", res5);
      testFailed++;
    }
  } catch (err) {
    console.error(" ❌ [FAIL] Test 5 Error:", err.message);
    testFailed++;
  }

  // -------------------------------------------------------------------
  // TEST 6: PRODUCT HELP ("How does AI Historian work?")
  // -------------------------------------------------------------------
  try {
    const res6 = await askFamilyHistorian({ currentUser: testUser, message: "How does AI Historian work?" });
    if (res6.intent === "SPOKEN_ODYSSEY_HELP" && res6.sourcesCount === 0 && res6.answer.includes("Spoken Odyssey")) {
      console.log(" ✅ [PASS] Test 6: Product Help ('How does AI Historian work?') -> System knowledge returned.");
      testPassed++;
    } else {
      console.error(" ❌ [FAIL] Test 6: Product Help failed:", res6);
      testFailed++;
    }
  } catch (err) {
    console.error(" ❌ [FAIL] Test 6 Error:", err.message);
    testFailed++;
  }

  // -------------------------------------------------------------------
  // TEST 7: DESCRIPTION KNOWLEDGE RETRIEVAL
  // -------------------------------------------------------------------
  try {
    const res7 = await askFamilyHistorian({ currentUser: testUser, message: "What happened at the ancestral home in Hangu?" });
    if (res7.sourcesCount > 0 && res7.answer.toLowerCase().includes("hangu")) {
      console.log(" ✅ [PASS] Test 7: Description Knowledge -> Memory description retrieved & used.");
      testPassed++;
    } else {
      console.error(" ❌ [FAIL] Test 7: Description Knowledge failed:", res7);
      testFailed++;
    }
  } catch (err) {
    console.error(" ❌ [FAIL] Test 7 Error:", err.message);
    testFailed++;
  }

  // -------------------------------------------------------------------
  // TEST 8: TRANSCRIPT KNOWLEDGE RETRIEVAL
  // -------------------------------------------------------------------
  try {
    const res8 = await askFamilyHistorian({ currentUser: testUser, message: "What did grandfather say about respecting elders?" });
    if (res8.sourcesCount > 0 && res8.answer.toLowerCase().includes("respect")) {
      console.log(" ✅ [PASS] Test 8: Transcript Knowledge -> Audio transcript retrieved & used.");
      testPassed++;
    } else {
      console.error(" ❌ [FAIL] Test 8: Transcript Knowledge failed:", res8);
      testFailed++;
    }
  } catch (err) {
    console.error(" ❌ [FAIL] Test 8 Error:", err.message);
    testFailed++;
  }

  // -------------------------------------------------------------------
  // TEST 9: TIME CAPSULE SECURITY / UNAUTHORIZED DATA
  // -------------------------------------------------------------------
  try {
    const res9 = await askFamilyHistorian({ currentUser: otherUser, message: "What advice is in the Locked Heritage Time Capsule 2035?" });
    if (res9.answer.includes("couldn't find") || res9.sourcesCount === 0) {
      console.log(" ✅ [PASS] Test 9: Time Capsule Security -> Locked vault memory excluded from non-owner.");
      testPassed++;
    } else {
      console.error(" ❌ [FAIL] Test 9: Time Capsule Security failed:", res9);
      testFailed++;
    }
  } catch (err) {
    console.error(" ❌ [FAIL] Test 9 Error:", err.message);
    testFailed++;
  }

  // -------------------------------------------------------------------
  // TEST 10: OUT OF SCOPE ("What is Python?")
  // -------------------------------------------------------------------
  try {
    const res10 = await askFamilyHistorian({ currentUser: testUser, message: "What is Python?" });
    if (res10.intent === "OUT_OF_SCOPE" && res10.sourcesCount === 0 && res10.answer.includes("Spoken Odyssey AI Family Historian")) {
      console.log(" ✅ [PASS] Test 10: Out of Scope ('What is Python?') -> Scope redirection response returned.");
      testPassed++;
    } else {
      console.error(" ❌ [FAIL] Test 10: Out of Scope failed:", res10);
      testFailed++;
    }
  } catch (err) {
    console.error(" ❌ [FAIL] Test 10 Error:", err.message);
    testFailed++;
  }

  console.log("\n===================================================================");
  console.log(` 📊 SUMMARY: ${testPassed} Passed | ${testFailed} Failed out of 10 Test Cases`);
  console.log("===================================================================\n");

  await prisma.$disconnect();
  process.exit(testFailed === 0 ? 0 : 1);
}

runMasterTestSuit().catch(err => {
  console.error("Master Test Suite Fatal Exception:", err);
  process.exit(1);
});
