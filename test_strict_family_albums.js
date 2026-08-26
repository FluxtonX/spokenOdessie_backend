require("dotenv").config();
const prisma = require("./src/config/prisma");
const familyService = require("./src/modules/familyCircle/familyCircle.service");
const albumService = require("./src/modules/albums/album.service");

async function runStrictFamilyAlbumsTest() {
  console.log("==========================================================");
  console.log("   STARTING STRICT FAMILY ALBUMS SEPARATION TEST         ");
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
    // 1. Setup Test User & Family Circle
    const userObj = await prisma.user.upsert({
      where: { email: "strict_album_test@odyssey.com" },
      create: { email: "strict_album_test@odyssey.com", displayName: "Strict Album User", role: "USER" },
      update: {}
    });

    const circle = await familyService.getOrCreateFamilyCircle({ currentUser: userObj });
    assert(circle && circle.id, `Family Space initialized (ID: ${circle?.id})`);

    // 2. Create a Personal Album (familyCircleId = null, privacy = Family)
    const personalAlbum = await prisma.album.create({
      data: {
        title: "Personal Development Album",
        subtitle: "My personal work notes",
        privacy: "Family",
        ownerId: userObj.id,
        familyCircleId: null
      }
    });
    assert(personalAlbum && personalAlbum.id, `Personal Album created (ID: ${personalAlbum.id}, familyCircleId: null)`);

    // 3. Create a Family Space Shared Album (familyCircleId = circle.id)
    const familyAlbum = await prisma.album.create({
      data: {
        title: "Official Family Vacation 2026",
        subtitle: "Shared memories from trip",
        privacy: "Family",
        ownerId: userObj.id,
        familyCircleId: circle.id
      }
    });
    assert(familyAlbum && familyAlbum.id, `Family Space Album created (ID: ${familyAlbum.id}, familyCircleId: ${circle.id})`);

    // 4. Test getFamilyCircleAlbums
    console.log("\n--- TEST: Fetch Family Space Albums ---");
    const spaceAlbums = await albumService.getFamilyCircleAlbums({
      currentUser: userObj,
      familyCircleId: circle.id
    });

    const hasFamilyAlbum = spaceAlbums.some(a => a.id === familyAlbum.id);
    const hasPersonalAlbum = spaceAlbums.some(a => a.id === personalAlbum.id);

    assert(hasFamilyAlbum, `Family Space Album '${familyAlbum.title}' IS present in Family Space`);
    assert(!hasPersonalAlbum, `Personal Album '${personalAlbum.title}' IS STRICTLY EXCLUDED from Family Space`);

    // Clean up test albums
    await prisma.album.deleteMany({
      where: { id: { in: [personalAlbum.id, familyAlbum.id] } }
    });

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

runStrictFamilyAlbumsTest();
