require("dotenv").config();
const prisma = require("./src/config/prisma");
const memoryService = require("./src/modules/memories/memory.service");

async function runGlassesIngestionVerification() {
  console.log("==========================================================");
  console.log("   STARTING AI GLASSES INGESTION AND IDEMPOTENCY TEST     ");
  console.log("==========================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  const testEmail = `glasses_test_${Date.now()}@spokenodyssey.com`;
  let testUser = null;
  let createdMemoryId = null;

  try {
    // 1. Setup Test User
    console.log("\n--- TEST 1: Test User Provisioning ---");
    testUser = await prisma.user.create({
      data: {
        email: testEmail,
        displayName: "Glasses Explorer",
        role: "USER",
      },
    });
    assert(testUser && testUser.id, `Test user created successfully (ID: ${testUser.id})`);

    // 2. Ingest New Glasses Media Payload
    console.log("\n--- TEST 2: Valid Glasses Media Ingestion ---");
    const testDeviceIdentifier = "AA:BB:CC:DD:EE:01";
    const testMediaId1 = "POV_PHOTO_001.JPG";
    const testMediaId2 = "POV_AUDIO_001.opus";
    const testChecksum1 = "sha256_mock_hash_photo_123456";
    const testChecksum2 = "sha256_mock_hash_audio_789012";

    const ingestPayload = {
      title: "Morning Garden Walk POV",
      description: "First-person capture testing with Spoken Odyssey AI Glasses",
      privacy: "Private",
      occurredAt: new Date().toISOString(),
      deviceIdentifier: testDeviceIdentifier,
      tags: ["Garden", "Morning"],
      assets: [
        {
          storageKey: `memories/${testUser.id}/glasses/photo_001.jpg`,
          thumbnailKey: `memories/${testUser.id}/glasses/photo_001_thumb.jpg`,
          originalName: testMediaId1,
          mimeType: "image/jpeg",
          fileSize: 2048500,
          deviceMediaId: testMediaId1,
          captureChecksum: testChecksum1,
        },
        {
          storageKey: `memories/${testUser.id}/glasses/audio_001.wav`,
          originalName: testMediaId2,
          mimeType: "audio/wav",
          fileSize: 512000,
          durationSec: 32.5,
          deviceMediaId: testMediaId2,
          captureChecksum: testChecksum2,
        },
      ],
    };

    const ingestResult = await memoryService.ingestGlassesMedia(testUser, ingestPayload);

    assert(ingestResult && ingestResult.isDuplicate === false, "Ingest result isDuplicate is false on first ingestion");
    assert(ingestResult.data && ingestResult.data.memoryId, `Memory created with ID: ${ingestResult.data.memoryId}`);
    assert(ingestResult.data.ingestedAssetsCount === 2, "Ingested exactly 2 media assets");
    assert(ingestResult.data.deviceSource === "AI_GLASSES", "Memory has deviceSource === 'AI_GLASSES'");

    createdMemoryId = ingestResult.data.memoryId;

    // 3. Database Persistence Verification
    console.log("\n--- TEST 3: Database Records and Provenance Verification ---");
    const dbMemory = await prisma.memory.findUnique({
      where: { id: createdMemoryId },
      include: { mediaAssets: true },
    });

    assert(dbMemory !== null, "Memory record exists in PostgreSQL database");
    assert(dbMemory.deviceSource === "AI_GLASSES", "Memory.deviceSource correctly set to AI_GLASSES in DB");
    assert(dbMemory.deviceIdentifier === testDeviceIdentifier, "Memory.deviceIdentifier matches hardware MAC");
    assert(dbMemory.mediaAssets.length === 2, "Memory has exactly 2 MediaAsset child records");

    const photoAsset = dbMemory.mediaAssets.find((a) => a.deviceMediaId === testMediaId1);
    assert(photoAsset && photoAsset.deviceSource === "AI_GLASSES", "Photo MediaAsset has deviceSource: AI_GLASSES");
    assert(photoAsset.captureChecksum === testChecksum1, "Photo MediaAsset stores SHA-256 captureChecksum");

    const audioAsset = dbMemory.mediaAssets.find((a) => a.deviceMediaId === testMediaId2);
    assert(audioAsset && audioAsset.mimeType === "audio/wav", "Audio MediaAsset stores correct MIME type");
    assert(audioAsset && ["PENDING", "PROCESSING", "FAILED", "COMPLETED"].includes(audioAsset.transcriptStatus), `Audio MediaAsset transcriptStatus engaged with AI pipeline (Status: ${audioAsset.transcriptStatus})`);

    // 4. Idempotency and Duplicate Re-try Verification
    console.log("\n--- TEST 4: Idempotency and Duplicate Ingestion Protection ---");
    const duplicateRetryResult = await memoryService.ingestGlassesMedia(testUser, ingestPayload);

    assert(duplicateRetryResult.isDuplicate === true, "Second identical ingest returns isDuplicate: true");
    assert(duplicateRetryResult.data.memoryId === createdMemoryId, "Duplicate ingest returns existing memory ID");
    assert(duplicateRetryResult.data.skippedDuplicatesCount === 2, "Correctly skipped 2 duplicate assets");
    assert(duplicateRetryResult.data.ingestedAssetsCount === 0, "Zero new assets created during retry");

    const totalMemories = await prisma.memory.count({ where: { ownerId: testUser.id } });
    assert(totalMemories === 1, "Database total memory count is still exactly 1 (No duplicate memory created)");

    // 5. Unique Constraint Database Enforcement Test
    console.log("\n--- TEST 5: Database Unique Constraint Enforcement ---");
    let duplicateConstraintCaught = false;
    try {
      await prisma.mediaAsset.create({
        data: {
          memoryId: createdMemoryId,
          ownerId: testUser.id,
          storageKey: "some/key.jpg",
          deviceSource: "AI_GLASSES",
          deviceIdentifier: testDeviceIdentifier,
          deviceMediaId: testMediaId1,
        },
      });
    } catch (dbErr) {
      if (dbErr.code === "P2002") {
        duplicateConstraintCaught = true;
      }
    }
    assert(duplicateConstraintCaught, "Database uniquely rejects duplicate (ownerId, deviceIdentifier, deviceMediaId) with P2002");

    // 6. Serialization and Frontend Output Verification
    console.log("\n--- TEST 6: Serialization for Web and Mobile Consumers ---");
    const userMemories = await memoryService.getMemoriesByUser(testUser, testUser.id);
    assert(userMemories.length === 1, "getMemoriesByUser returns 1 memory");
    const serialized = userMemories[0];
    assert(serialized.deviceSource === "AI_GLASSES", "Serialized memory includes deviceSource: AI_GLASSES");
    assert(serialized.deviceIdentifier === testDeviceIdentifier, "Serialized memory includes deviceIdentifier");
    assert(Array.isArray(serialized.mediaList) && serialized.mediaList.length === 2, "Serialized mediaList contains 2 items");
    assert(serialized.mediaList[0].deviceSource === "AI_GLASSES", "Serialized mediaList item includes deviceSource: AI_GLASSES");

  } catch (err) {
    console.error("UNHANDLED ERROR IN TEST:", err);
    failed++;
  } finally {
    // 7. Cleanup
    console.log("\n--- CLEANUP ---");
    if (createdMemoryId) {
      await prisma.mediaAsset.deleteMany({ where: { memoryId: createdMemoryId } });
      await prisma.memory.delete({ where: { id: createdMemoryId } });
      console.log("Cleaned up test memory and media assets");
    }
    if (testUser && testUser.id) {
      await prisma.user.delete({ where: { id: testUser.id } });
      console.log("Cleaned up test user");
    }
  }

  console.log("\n==========================================================");
  console.log(`   TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runGlassesIngestionVerification();
