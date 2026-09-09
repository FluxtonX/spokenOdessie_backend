require("dotenv").config({ path: __dirname + "/.env" });
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "AKIA_TEST_ODYSSEY_KEY";
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "test_secret_odyssey_secret_key_123456789";
process.env.AWS_REGION = process.env.AWS_REGION || "eu-west-2";
process.env.AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "spoken-odyssey-media";

const prisma = require("./src/config/prisma");
const { ingestGlassesMedia, serializeMemory } = require("./src/modules/memories/memory.service");
const { indexMemoryForRag } = require("./src/modules/aiHistorian/embedding.service");
const { getUploadPresignedUrl } = require("./src/services/s3.service");
const { getAuthorizedMemoryIdsForUser } = require("./src/modules/aiHistorian/permissionScope.service");

async function runMultiplatformParityTest() {
  console.log("\n==========================================================================");
  console.log(" 🌐 SPOKEN ODYSSEY — ANDROID & IOS MULTIPLATFORM PARITY AUDIT");
  console.log(" Flow: Glasses → Flutter (Android/iOS) → API → S3 → MediaAsset → Memory → AI → Web");
  console.log("==========================================================================\n");

  let passed = 0;
  let failed = 0;

  const assert = (condition, msg) => {
    if (condition) {
      console.log(` ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(` ❌ [FAIL] ${msg}`);
      failed++;
    }
  };

  try {
    // 1. Authenticate Test User
    let testUser = await prisma.user.findFirst({
      where: { email: "parity_test_user@spokenodyssey.com" }
    });
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: "parity_test_user@spokenodyssey.com",
          displayName: "Multiplatform Parity Tester",
          bio: "Verifying Android and iOS glasses parity",
        }
      });
    }
    assert(testUser && testUser.id, "Authenticated user initialized for multiplatform session");

    // 2. Test S3 Presigned Upload Engine (Batch & Single)
    console.log(" ☁️ [S3 PRESIGNING] Testing single and batch presigned URL generation...");
    const singlePresigned = await getUploadPresignedUrl({
      fileName: "test-single.jpg",
      fileType: "image/jpeg",
      folder: `memories/${testUser.id}`
    });
    assert(singlePresigned && singlePresigned.uploadUrl && singlePresigned.key.includes(testUser.id), "Single file presigned S3 URL generated successfully");

    // Test batch generation helper (simulating upload.controller logic)
    const filesToPresign = [
      { fileName: "android_pov.mp4", fileType: "video/mp4", clientAssetId: "asset-1" },
      { fileName: "android_audio.aac", fileType: "audio/aac", clientAssetId: "asset-2" }
    ];
    const batchPresigned = await Promise.all(filesToPresign.map(f => getUploadPresignedUrl({
      fileName: f.fileName,
      fileType: f.fileType,
      folder: `memories/${testUser.id}`
    })));
    assert(batchPresigned.length === 2 && batchPresigned.every(b => b.uploadUrl && b.key), "Batch presigned S3 URLs generated for multi-asset upload (count = 2)");

    // 3. Android Flutter Sync Simulation (HeyCyan/JieLi Android SDK)
    console.log(" 🤖 [ANDROID FLOW] Ingesting simulated Android glasses session...");
    const androidTimestamp = Date.now().toString(36);
    const androidPayload = {
      deviceIdentifier: "HC-AND-JLI-9011",
      title: `Mountain Biking POV [Android] (${androidTimestamp})`,
      description: "Recorded through HeyCyan Android SDK bridge on Mountain Loop trail.",
      privacy: "Private",
      mood: "Adventurous",
      tags: ["glasses", "android", "sports", "pov"],
      assets: [
        {
          deviceMediaId: `VID_${androidTimestamp}_001.mp4`,
          storageKey: `memories/${testUser.id}/VID_${androidTimestamp}_001.mp4`,
          originalName: `VID_${androidTimestamp}_001.mp4`,
          mimeType: "video/mp4",
          fileSize: 24500000,
          durationSec: 35.5,
          captureChecksum: `sha256-and-vid-${androidTimestamp}-111`
        },
        {
          deviceMediaId: `AUD_${androidTimestamp}_002.aac`,
          storageKey: `memories/${testUser.id}/AUD_${androidTimestamp}_002.aac`,
          originalName: `AUD_${androidTimestamp}_002.aac`,
          mimeType: "audio/aac",
          fileSize: 850000,
          durationSec: 35.5,
          captureChecksum: `sha256-and-aud-${androidTimestamp}-222`
        }
      ]
    };

    const androidIngest = await ingestGlassesMedia(testUser, androidPayload);
    const androidMemoryId = androidIngest.data?.memoryId || androidIngest.data?.memory?.id;
    assert(androidIngest && androidMemoryId, "Android glasses memory created successfully");
    assert(androidIngest.data?.deviceSource === "AI_GLASSES", "Android memory tagged as 'AI_GLASSES'");
    assert(androidIngest.data?.ingestedAssetsCount === 2, "Android multi-asset count = 2");

    // 4. iOS Flutter Sync Simulation (QCSDK/JieLi iOS SDK)
    console.log(" 🍎 [IOS FLOW] Ingesting simulated iOS glasses session...");
    const iosTimestamp = Date.now().toString(36) + "_ios";
    const iosPayload = {
      deviceIdentifier: "QC-IOS-JLI-8022",
      title: `Family Dinner POV [iOS] (${iosTimestamp})`,
      description: "Recorded through QCSDK iOS bridge during family dinner.",
      privacy: "Private",
      mood: "Heartwarming",
      tags: ["glasses", "ios", "family", "pov"],
      assets: [
        {
          deviceMediaId: `QC_VID_${iosTimestamp}_001.mov`,
          storageKey: `memories/${testUser.id}/QC_VID_${iosTimestamp}_001.mov`,
          originalName: `QC_VID_${iosTimestamp}_001.mov`,
          mimeType: "video/quicktime",
          fileSize: 31200000,
          durationSec: 28.0,
          captureChecksum: `sha256-ios-vid-${iosTimestamp}-333`
        },
        {
          deviceMediaId: `QC_AUD_${iosTimestamp}_002.m4a`,
          storageKey: `memories/${testUser.id}/QC_AUD_${iosTimestamp}_002.m4a`,
          originalName: `QC_AUD_${iosTimestamp}_002.m4a`,
          mimeType: "audio/mp4",
          fileSize: 720000,
          durationSec: 28.0,
          captureChecksum: `sha256-ios-aud-${iosTimestamp}-444`
        }
      ]
    };

    const iosIngest = await ingestGlassesMedia(testUser, iosPayload);
    const iosMemoryId = iosIngest.data?.memoryId || iosIngest.data?.memory?.id;
    assert(iosIngest && iosMemoryId, "iOS glasses memory created successfully");
    assert(iosIngest.data?.deviceSource === "AI_GLASSES", "iOS memory tagged as 'AI_GLASSES'");
    assert(iosIngest.data?.ingestedAssetsCount === 2, "iOS multi-asset count = 2");

    // 5. Cross-Platform Parity Verification
    console.log(" ⚖️ [PARITY VERIFICATION] Comparing Android and iOS database representations...");
    const [androidDb, iosDb] = await Promise.all([
      prisma.memory.findUnique({ where: { id: androidMemoryId }, include: { mediaAssets: true } }),
      prisma.memory.findUnique({ where: { id: iosMemoryId }, include: { mediaAssets: true } })
    ]);

    assert(androidDb.deviceSource === iosDb.deviceSource && androidDb.deviceSource === "AI_GLASSES", "Both Android and iOS memories share identical 'AI_GLASSES' deviceSource");
    assert(androidDb.mediaAssets.length === iosDb.mediaAssets.length && androidDb.mediaAssets.length === 2, "Both Android and iOS memories preserve 2 MediaAssets");
    assert(androidDb.deviceIdentifier === "HC-AND-JLI-9011", "Android hardware identifier preserved");
    assert(iosDb.deviceIdentifier === "QC-IOS-JLI-8022", "iOS hardware identifier preserved");

    // 6. Cross-Platform Idempotency Verification
    console.log(" 🔄 [IDEMPOTENCY] Testing idempotent retries for both Android and iOS...");
    const [androidRetry, iosRetry] = await Promise.all([
      ingestGlassesMedia(testUser, androidPayload),
      ingestGlassesMedia(testUser, iosPayload)
    ]);
    assert(androidRetry.isDuplicate === true && androidRetry.data.memoryId === androidMemoryId, "Android retry returns existing memory with isDuplicate: true");
    assert(iosRetry.isDuplicate === true && iosRetry.data.memoryId === iosMemoryId, "iOS retry returns existing memory with isDuplicate: true");

    // 7. AI Vector RAG Indexing on Both Platforms
    console.log(" 🧠 [AI RAG] Verifying RAG indexing for both Android and iOS memories...");
    const [androidRag, iosRag] = await Promise.all([
      indexMemoryForRag(androidMemoryId),
      indexMemoryForRag(iosMemoryId)
    ]);
    assert(androidRag.indexedCount > 0 && iosRag.indexedCount > 0, "Both Android and iOS memories indexed into vector RAG table");

    // 8. Next.js Web Serialization Parity
    console.log(" 🖥️ [WEB UI PARITY] Testing serialization contract for web rendering...");
    const [androidWeb, iosWeb] = await Promise.all([
      serializeMemory(androidDb, testUser),
      serializeMemory(iosDb, testUser)
    ]);

    assert(androidWeb.deviceSource === "AI_GLASSES" && iosWeb.deviceSource === "AI_GLASSES", "Both platforms serialize deviceSource = 'AI_GLASSES' for web badges");
    assert(androidWeb.deviceIdentifier === "HC-AND-JLI-9011" && iosWeb.deviceIdentifier === "QC-IOS-JLI-8022", "Both platforms output deviceIdentifier for web modal sidebar");
    assert(androidWeb.mediaList.length === 2 && iosWeb.mediaList.length === 2, "Both platforms output structured mediaList for web carousel/player");

  } catch (err) {
    console.error("Fatal test error:", err);
    failed++;
  } finally {
    console.log("\n==========================================================================");
    console.log(` 📊 SUMMARY: ${passed} Passed | ${failed} Failed out of ${passed + failed} Tests`);
    console.log("==========================================================================\n");
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runMultiplatformParityTest();
