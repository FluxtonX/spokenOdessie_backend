require("dotenv").config();
const prisma = require("./src/config/prisma");
const familyService = require("./src/modules/familyCircle/familyCircle.service");

async function runFamilyTimelineFiltersTest() {
  console.log("==========================================================");
  console.log("   STARTING FAMILY TIMELINE FILTERS VERIFICATION          ");
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
    const userA = await prisma.user.upsert({
      where: { email: "filter_test_a@odyssey.com" },
      create: { email: "filter_test_a@odyssey.com", displayName: "Filter Dad", role: "USER" },
      update: {}
    });

    const userB = await prisma.user.upsert({
      where: { email: "filter_test_b@odyssey.com" },
      create: { email: "filter_test_b@odyssey.com", displayName: "Filter Son", role: "USER" },
      update: {}
    });

    // 2. Setup Family Circle & Membership
    const circle = await familyService.getOrCreateFamilyCircle({ currentUser: userA });
    assert(circle && circle.id, `Family Space initialized (ID: ${circle?.id})`);

    let memberB = await prisma.familyMember.findFirst({
      where: { familyCircleId: circle.id, userId: userB.id }
    });
    if (!memberB) {
      memberB = await prisma.familyMember.create({
        data: {
          familyCircleId: circle.id,
          userId: userB.id,
          role: "ADULT_MEMBER",
          relationship: "Son"
        }
      });
    }

    // 3. Create Sample Memories (Voice, Photo, Written)
    const voiceMemA = await prisma.memory.create({
      data: {
        title: "Dad's Fishing Audio Story",
        description: "Voice story about the lake trip",
        type: "Voice",
        privacy: "Family",
        ownerId: userA.id,
        status: "published"
      }
    });

    const photoMemB = await prisma.memory.create({
      data: {
        title: "Son's Graduation Photo",
        description: "Ceremony day photo",
        type: "Photo",
        privacy: "Family",
        ownerId: userB.id,
        status: "published"
      }
    });

    const writtenMemA = await prisma.memory.create({
      data: {
        title: "Dad's Journal Note",
        description: "Written reflection on family values",
        type: "Written",
        privacy: "Family",
        ownerId: userA.id,
        status: "published"
      }
    });

    // 4. Test Unfiltered Retrieval
    console.log("\n--- TEST 1: Unfiltered Timeline Retrieval ---");
    const allMemories = await familyService.getFamilySharedMemories({ currentUser: userA });
    assert(allMemories.length >= 3, `Unfiltered timeline returned all family memories (Count: ${allMemories.length})`);

    // 5. Test Filter by Target Member ID
    console.log("\n--- TEST 2: Filter by Member (User B) ---");
    const sonMemories = await familyService.getFamilySharedMemories({
      currentUser: userA,
      targetUserId: userB.id
    });
    assert(sonMemories.every(m => m.ownerId === userB.id), `Member filter correctly isolated User B's memories (Count: ${sonMemories.length})`);
    assert(sonMemories.some(m => m.id === photoMemB.id), `User B's Graduation Photo present in filtered results`);

    // 6. Test Filter by Media Type
    console.log("\n--- TEST 3: Filter by Media Type ('Voice') ---");
    const voiceMemories = await familyService.getFamilySharedMemories({
      currentUser: userA,
      type: "Voice"
    });
    assert(voiceMemories.some(m => m.id === voiceMemA.id), `Voice filter returned Dad's Fishing Audio Story`);
    assert(!voiceMemories.some(m => m.id === photoMemB.id), `Voice filter excluded Photo memory`);

    // 7. Test Keyword Search
    console.log("\n--- TEST 4: Keyword Search Query ---");
    const searchResults = await familyService.getFamilySharedMemories({
      currentUser: userA,
      searchQuery: "Graduation"
    });
    assert(searchResults.length === 1 && searchResults[0].id === photoMemB.id, `Keyword search 'Graduation' returned exact match (Title: ${searchResults[0]?.title})`);

  } catch (err) {
    console.error("Test Error:", err);
    failed++;
  } finally {
    console.log("\n==========================================================");
    console.log(`   VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED   `);
    console.log("==========================================================");
    process.exit(failed > 0 ? 1 : 0);
  }
}

runFamilyTimelineFiltersTest();
