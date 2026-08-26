require("dotenv").config();
const prisma = require("./src/config/prisma");
const familyService = require("./src/modules/familyCircle/familyCircle.service");
const albumService = require("./src/modules/albums/album.service");

async function runFamilyAlbumsTest() {
  console.log("==========================================================");
  console.log("   STARTING MULTI-CONTRIBUTOR FAMILY ALBUMS VERIFICATION  ");
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
      where: { email: "test_album_creator@odyssey.com" },
      create: { email: "test_album_creator@odyssey.com", displayName: "Mudassir Creator", role: "USER" },
      update: {}
    });

    const userB = await prisma.user.upsert({
      where: { email: "test_album_contributor@odyssey.com" },
      create: { email: "test_album_contributor@odyssey.com", displayName: "Wilayat Contributor", role: "USER" },
      update: {}
    });

    // 2. Setup Family Circle & Membership
    const circle = await familyService.getOrCreateFamilyCircle({ currentUser: userA });
    assert(circle && circle.id, `Family Space initialized (ID: ${circle?.id})`);

    // Ensure User B is a member of circle
    let memberB = await prisma.familyMember.findFirst({
      where: { familyCircleId: circle.id, userId: userB.id }
    });
    if (!memberB) {
      memberB = await prisma.familyMember.create({
        data: {
          familyCircleId: circle.id,
          userId: userB.id,
          role: "ADULT_MEMBER",
          relationship: "Father"
        }
      });
    }
    assert(memberB, `User B bound to Family Space`);

    // 3. Create Family Album
    console.log("\n--- TEST 1: Family Album Creation ---");
    const familyAlbum = await albumService.createAlbum({
      user: userA,
      title: "Summer Family Reunion 2026",
      subtitle: "Memories contributed across generations",
      privacy: "Family",
      familyCircleId: circle.id,
      coverUrl: "https://images.unsplash.com/photo-1511895426328-dc8714191300"
    });

    assert(familyAlbum && familyAlbum.id, `Family Album created (ID: ${familyAlbum.id})`);
    assert(familyAlbum.familyCircleId === circle.id, `Album bound to Family Space (familyCircleId: ${familyAlbum.familyCircleId})`);
    assert(familyAlbum.contributors.length >= 1, `Creator registered in contributors facepile (Count: ${familyAlbum.contributors.length})`);

    // 4. Create Memories for User A & User B
    console.log("\n--- TEST 2: Multi-Member Contributions ---");
    const memoryA = await prisma.memory.create({
      data: {
        title: "Mudassir's Welcome Speech",
        description: "Recorded at the beach house",
        ownerId: userA.id,
        privacy: "Family",
        status: "published"
      }
    });

    const memoryB = await prisma.memory.create({
      data: {
        title: "Wilayat's Grill Party Photo",
        description: "Father's famous BBQ session",
        ownerId: userB.id,
        privacy: "Family",
        status: "published"
      }
    });

    // Link Memory A to Album (via User A)
    await albumService.addMemoryToAlbum({
      currentUser: userA,
      albumId: familyAlbum.id,
      memoryId: memoryA.id
    });

    // Link Memory B to Album (via User B - non-owner contributor!)
    const updatedAlbum = await albumService.addMemoryToAlbum({
      currentUser: userB,
      albumId: familyAlbum.id,
      memoryId: memoryB.id
    });

    assert(updatedAlbum.memories.length === 2, `Family Album contains 2 memories from multiple members (Count: ${updatedAlbum.memories.length})`);
    assert(updatedAlbum.contributors.length === 2, `Contributor facepile serialized 2 distinct members (Count: ${updatedAlbum.contributors.length})`);

    const contributorUserIds = updatedAlbum.contributors.map(c => c.userId);
    assert(contributorUserIds.includes(userA.id) && contributorUserIds.includes(userB.id), `Facepile includes both Creator (User A) and Contributor (User B)`);

    // 5. Fetch Family Space Albums
    console.log("\n--- TEST 3: Space Albums Query ---");
    const spaceAlbums = await albumService.getFamilyCircleAlbums({
      currentUser: userA,
      familyCircleId: circle.id
    });

    assert(spaceAlbums.some(a => a.id === familyAlbum.id), `Family Circle albums endpoint returned created Family Album`);

    // 6. Test Private Album Isolation
    console.log("\n--- TEST 4: Private Album Protection ---");
    const privateAlbum = await albumService.createAlbum({
      user: userA,
      title: "Mudassir's Private Journal",
      privacy: "Private"
    });

    let caughtError = null;
    try {
      await albumService.addMemoryToAlbum({
        currentUser: userB,
        albumId: privateAlbum.id,
        memoryId: memoryB.id
      });
    } catch (err) {
      caughtError = err;
    }

    assert(caughtError !== null && caughtError.statusCode === 403, `Non-owner contribution to private album correctly rejected with 403 Forbidden`);

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

runFamilyAlbumsTest();
