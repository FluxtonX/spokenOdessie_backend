const prisma = require("../../config/prisma");

/**
 * Intelligent Text Chunking Strategy
 * Splits long text into ~300 word chunks with 50 word overlap.
 */
function chunkText(text, chunkSize = 300, overlap = 50) {
  if (!text || typeof text !== "string") return [];
  const words = text.trim().split(/\s+/);
  if (words.length <= chunkSize) return [text.trim()];

  const chunks = [];
  let i = 0;
  while (i < words.length) {
    const chunkWords = words.slice(i, i + chunkSize);
    chunks.push(chunkWords.join(" "));
    i += chunkSize - overlap;
  }
  return chunks;
}

/**
 * Generate Embedding Vector for Text
 */
async function generateEmbedding(text) {
  if (!text) return null;

  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith("sk-")) {
    try {
      const { OpenAI } = require("openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const res = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text.slice(0, 8000)
      });
      return res.data[0]?.embedding || null;
    } catch (err) {
      console.warn("OpenAI embedding generation failed:", err.message);
    }
  }
  return null;
}

/**
 * Index a Memory for RAG Vector Retrieval ("Embed Once, Reuse Forever")
 */
const indexMemoryForRag = async (memoryId) => {
  const memory = await prisma.memory.findUnique({
    where: { id: memoryId },
    include: {
      mediaAssets: true,
      storyLayers: true,
      familyLinks: true
    }
  });

  if (!memory) return null;

  // Clear existing embedding documents for clean re-indexing
  await prisma.embeddingDocument.deleteMany({
    where: { memoryId }
  });

  const familyCircleId = memory.familyLinks[0]?.familyCircleId || null;
  const docsToCreate = [];

  // 1. Index Main Memory Title & Description
  const mainText = `${memory.title}\n${memory.description || ""}\nTags: ${(memory.tags || []).join(", ")}`;
  const mainChunks = chunkText(mainText);

  for (const chunk of mainChunks) {
    docsToCreate.push({
      familyCircleId,
      memoryId: memory.id,
      contentType: "TEXT",
      content: chunk,
      vectorText: chunk,
      metadata: {
        title: memory.title,
        occurredAt: memory.occurredAt,
        tags: memory.tags,
        privacy: memory.privacy,
        type: memory.type
      }
    });
  }

  // 2. Index Story Layers
  for (const layer of memory.storyLayers) {
    const layerContent = layer.transcriptText || layer.text || "";
    if (layerContent) {
      const layerChunks = chunkText(layerContent);
      for (const chunk of layerChunks) {
        docsToCreate.push({
          familyCircleId,
          memoryId: memory.id,
          storyLayerId: layer.id,
          contentType: "STORY_LAYER",
          content: chunk,
          vectorText: chunk,
          metadata: {
            title: `Story Layer: ${memory.title}`,
            authorId: layer.authorId,
            occurredAt: layer.occurredAt
          }
        });
      }
    }
  }

  // 3. Index Transcribed Media Assets
  for (const media of memory.mediaAssets) {
    if (media.transcriptText) {
      const mediaChunks = chunkText(media.transcriptText);
      for (const chunk of mediaChunks) {
        docsToCreate.push({
          familyCircleId,
          memoryId: memory.id,
          mediaAssetId: media.id,
          contentType: media.mimeType?.startsWith("video") ? "VIDEO_TRANSCRIPT" : "VOICE_TRANSCRIPT",
          content: chunk,
          vectorText: chunk,
          metadata: {
            title: `Media Transcript: ${media.originalName || memory.title}`,
            durationSec: media.durationSec,
            mimeType: media.mimeType
          }
        });
      }
    }
  }

  // Save Embedding Documents to Database
  if (docsToCreate.length > 0) {
    await prisma.embeddingDocument.createMany({
      data: docsToCreate
    });
  }

  return { indexedCount: docsToCreate.length };
};

module.exports = {
  chunkText,
  generateEmbedding,
  indexMemoryForRag
};
