require("dotenv").config({ path: __dirname + "/.env" });
const prisma = require("./src/config/prisma");
const { ingestGlassesMedia, serializeMemory } = require("./src/modules/memories/memory.service");
const { indexMemoryForRag } = require("./src/modules/aiHistorian/embedding.service");
const { getSystemKnowledgeResponse } = require("./src/modules/aiHistorian/systemKnowledge");
const { getAuthorizedMemoryIdsForUser } = require("./src/modules/aiHistorian/permissionScope.service");

async function runEndToEndVerification() {
  console.log("\n==========================================================================");
  console.log(" 👓 SPOKEN ODYSSEY — FULL LIFECYCLE AI GLASSES INTEGRATION E2E AUDIT");
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
    // 1. Setup Test User
    let testUser = await prisma.user.findFirst({
      where: { email: "glasses_e2e_owner@spokenodyssey.com" }
    });
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: "glasses_e2e_owner@spokenodyssey.com",
          displayName: "Odyssey Glasses Explorer",
          bio: "Field testing AI smart glasses integration",
          profession: "Technologist",
          location: "San Francisco"
        }
      });
    }
    assert(testUser && testUser.id, "Owner user authenticated for glasses session");

    // Stranger user for privacy barrier test
    let strangerUser = await prisma.user.findFirst({
      where: { email: "glasses_e2e_stranger@spokenodyssey.com" }
    });
    if (!strangerUser) {
      strangerUser = await prisma.user.create({
        data: {
          email: "glasses_e2e_stranger@spokenodyssey.com",
          displayName: "Stranger Without Access"
        }
      });
    }
    assert(strangerUser && strangerUser.id, "Stranger user initialized for privacy scope testing");

    // 2. Ingest Glasses POV Memory Payload
    const uniqueSession = Date.now().toString(36);
    const glassesPayload = {
      deviceIdentifier: "SO-GLS-JL-5001",
      title: `Grand Canyon POV Sunrise (${uniqueSession})`,
      description: "Hands-free video capture through Spoken Odyssey AI Glasses while hiking South Rim trail.",
      privacy: "Private",
      mood: "Awe-inspiring",
      tags: ["glasses", "grand-canyon", "sunrise", "nature"],
      mediaAssets: [
        {
          deviceMediaId: `VID_POV_${uniqueSession}_001.mp4`,
          mediaUrl: `https://spokenodyssey-assets.s3.amazonaws.com/e2e/${uniqueSession}_video.mp4`,
          storageKey: `e2e/${uniqueSession}_video.mp4`,
          mimeType: "video/mp4",
          fileSize: 18450200,
          durationSec: 42,
          captureChecksum: `sha256-vid-${uniqueSession}-abc12345`
        },
        {
          deviceMediaId: `AUD_POV_${uniqueSession}_002.aac`,
          mediaUrl: `https://spokenodyssey-assets.s3.amazonaws.com/e2e/${uniqueSession}_audio.aac`,
          storageKey: `e2e/${uniqueSession}_audio.aac`,
          mimeType: "audio/aac",
          fileSize: 620400,
          durationSec: 42,
          captureChecksum: `sha256-aud-${uniqueSession}-xyz98765`
        }
      ]
    };

    console.log(" 📦 [INGESTION] Ingesting multi-asset smart glasses memory...");
    const ingestResult = await ingestGlassesMedia(testUser, glassesPayload);

    const memoryId = ingestResult.data?.memoryId || ingestResult.data?.memory?.id;
    const memoryData = ingestResult.data?.memory;

    assert(ingestResult && memoryId, "Glasses memory successfully created with unique ID");
    assert(ingestResult.data?.deviceSource === "AI_GLASSES", "Ingest response deviceSource is tagged as 'AI_GLASSES'");
    assert(memoryData?.deviceIdentifier === "SO-GLS-JL-5001", "Memory preserves hardware deviceIdentifier");
    assert(ingestResult.data?.ingestedAssetsCount === 2, "Both POV video and companion audio assets persisted (count = 2)");

    // 3. Verify Database Integrity & Provenance Fields
    const dbMemory = await prisma.memory.findUnique({
      where: { id: memoryId },
      include: { mediaAssets: true }
    });

    assert(dbMemory !== null, "Memory record found in PostgreSQL database");
    assert(dbMemory.deviceSource === "AI_GLASSES", "PostgreSQL memory.deviceSource persisted as 'AI_GLASSES'");
    assert(dbMemory.mediaAssets.every(a => a.deviceSource === "AI_GLASSES"), "All MediaAssets have deviceSource = 'AI_GLASSES'");
    assert(dbMemory.mediaAssets.some(a => a.captureChecksum === `sha256-vid-${uniqueSession}-abc12345`), "Video SHA-256 capture checksum persisted");
    assert(dbMemory.mediaAssets.some(a => a.captureChecksum === `sha256-aud-${uniqueSession}-xyz98765`), "Audio SHA-256 capture checksum persisted");

    // 4. Test Idempotency & Deduplication
    console.log(" 🔄 [IDEMPOTENCY] Retrying ingestion with identical checksums...");
    const retryResult = await ingestGlassesMedia(testUser, glassesPayload);
    const retryMemoryId = retryResult.data?.memoryId || retryResult.data?.memory?.id;
    assert(retryMemoryId === memoryId, "Retry returns existing memory ID without creating duplicate");
    assert(retryResult.isDuplicate === true, "Retry flagged correctly as duplicate payload");

    const totalAssetsAfterRetry = await prisma.mediaAsset.count({
      where: { memoryId: memoryId }
    });
    assert(totalAssetsAfterRetry === 2, "No duplicate MediaAssets created upon idempotent retry (count = 2)");

    // 5. Test AI RAG Vector Indexing
    console.log(" 🧠 [AI RAG INDEXING] Indexing glasses memory into EmbeddingDocument table...");
    const ragIndexResult = await indexMemoryForRag(memoryId);
    assert(ragIndexResult && ragIndexResult.indexedCount > 0, `RAG indexing generated ${ragIndexResult?.indexedCount} documents`);

    const embeddedDocs = await prisma.embeddingDocument.findMany({
      where: { memoryId: memoryId }
    });
    assert(embeddedDocs.length > 0, "EmbeddingDocument records persisted in database");
    assert(embeddedDocs[0].metadata?.deviceSource === "AI_GLASSES", "RAG vector metadata preserves deviceSource: 'AI_GLASSES'");
    assert(embeddedDocs[0].metadata?.deviceIdentifier === "SO-GLS-JL-5001", "RAG vector metadata preserves deviceIdentifier: 'SO-GLS-JL-5001'");

    // 6. Test AI Historian System Knowledge for Glasses
    console.log(" 🤖 [AI KNOWLEDGE] Testing AI Historian product knowledge regarding Smart Glasses...");
    const glassesFaq = getSystemKnowledgeResponse("how do smart glasses work with spoken odyssey");
    assert(glassesFaq && glassesFaq.toLowerCase().includes("smart glasses"), "AI Historian has built-in smart glasses product knowledge");

    // 7. Test Privacy & Permission Scope Barrier
    console.log(" 🛡️ [SECURITY] Verifying permission scope excludes private glasses memory from strangers...");
    const ownerAllowed = await getAuthorizedMemoryIdsForUser(testUser);
    const strangerAllowed = await getAuthorizedMemoryIdsForUser(strangerUser);

    assert(ownerAllowed.includes(memoryId), "Owner has authorized access to private glasses memory");
    assert(!strangerAllowed.includes(memoryId), "Stranger is strictly prohibited from accessing private glasses memory");

    // 8. Test Frontend Serialization Integrity
    console.log(" 🖥️ [SERIALIZATION] Verifying serialization contract for frontend badge rendering...");
    const serialized = await serializeMemory(dbMemory, testUser);
    assert(serialized.deviceSource === "AI_GLASSES", "Serialized payload outputs deviceSource = 'AI_GLASSES'");
    assert(serialized.deviceIdentifier === "SO-GLS-JL-5001", "Serialized payload outputs deviceIdentifier = 'SO-GLS-JL-5001'");
    assert(Array.isArray(serialized.mediaList) && serialized.mediaList.length === 2, "Serialized payload includes mediaList array for slider/player (count = 2)");

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

runEndToEndVerification();
