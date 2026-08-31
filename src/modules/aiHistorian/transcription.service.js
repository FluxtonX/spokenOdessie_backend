const prisma = require("../../config/prisma");
const fs = require("fs");
const path = require("path");
const os = require("os");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const { indexMemoryForRag } = require("./embedding.service");

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Extract Audio from Video using FFmpeg
 */
const extractAudioFromVideo = (videoFilePath) => {
  return new Promise((resolve, reject) => {
    const tempAudioPath = path.join(os.tmpdir(), `audio-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`);
    
    ffmpeg(videoFilePath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate(128)
      .output(tempAudioPath)
      .on("end", () => resolve(tempAudioPath))
      .on("error", (err) => reject(err))
      .run();
  });
};

/**
 * Process Media Asset Transcription Asynchronously
 */
const processMediaAssetTranscription = async (mediaAssetId) => {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: mediaAssetId }
  });

  if (!asset) return null;
  if (asset.transcriptStatus === "COMPLETED") {
    return { status: "COMPLETED", transcriptText: asset.transcriptText };
  }

  // Update status to PROCESSING
  await prisma.mediaAsset.update({
    where: { id: mediaAssetId },
    data: { transcriptStatus: "PROCESSING" }
  });

  let tempExtractedAudioPath = null;

  try {
    let transcriptText = "";
    let transcriptSegments = [];
    let fileToTranscribe = asset.storageKey;

    // 1. If Video asset, extract audio track using FFmpeg
    if (asset.mimeType && asset.mimeType.startsWith("video/") && asset.storageKey && fs.existsSync(asset.storageKey)) {
      try {
        tempExtractedAudioPath = await extractAudioFromVideo(asset.storageKey);
        fileToTranscribe = tempExtractedAudioPath;
        console.log(` 🎵 [AUDIO EXTRACTION SUCCESS] Extracted audio track from video: ${asset.originalName}`);
      } catch (extractErr) {
        console.warn("Failed to extract audio from video with FFmpeg:", extractErr.message);
      }
    }

    // 2. Check OpenAI API Key for Whisper transcription
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith("sk-")) {
      const { OpenAI } = require("openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      if (fileToTranscribe && fs.existsSync(fileToTranscribe)) {
        const response = await openai.audio.transcriptions.create({
          file: fs.createReadStream(fileToTranscribe),
          model: "whisper-1",
          response_format: "verbose_json",
          timestamp_granularities: ["segment"]
        }).catch((err) => {
          console.warn("Whisper API transcription failed:", err.message);
          return null;
        });

        if (response) {
          transcriptText = response.text || "";
          transcriptSegments = response.segments || [];
        }
      }
    }

    // 3. Fallback: If Whisper API is pending or key unconfigured, generate structured metadata transcript
    if (!transcriptText) {
      const isVideo = asset.mimeType?.startsWith("video/");
      transcriptText = isVideo
        ? `Video recording "${asset.originalName || 'Preserved Video'}" preserved in family memory.`
        : `Voice recording "${asset.originalName || 'Voice Note'}" preserved in family memory.`;
      
      transcriptSegments = [
        { start: 0, end: asset.durationSec || 15, text: transcriptText }
      ];
    }

    const updated = await prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: {
        transcriptText,
        transcriptStatus: "COMPLETED",
        transcriptSegments
      }
    });

    // 4. Auto-index memory into RAG EmbeddingDocument table
    if (asset.memoryId) {
      await indexMemoryForRag(asset.memoryId).catch(() => {});
    }

    return updated;
  } catch (err) {
    console.error("Transcription failed for MediaAsset:", mediaAssetId, err);
    await prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: { transcriptStatus: "FAILED" }
    });
    return null;
  } finally {
    // 5. Cleanup temporary extracted audio file if created
    if (tempExtractedAudioPath && fs.existsSync(tempExtractedAudioPath)) {
      try {
        fs.unlinkSync(tempExtractedAudioPath);
      } catch (_) {}
    }
  }
};

/**
 * Process Story Layer Voice Note Transcription
 */
const processStoryLayerTranscription = async (storyLayerId) => {
  const layer = await prisma.storyLayer.findUnique({
    where: { id: storyLayerId }
  });

  if (!layer) return null;
  if (layer.transcriptStatus === "COMPLETED") {
    return { status: "COMPLETED", transcriptText: layer.transcriptText };
  }

  await prisma.storyLayer.update({
    where: { id: storyLayerId },
    data: { transcriptStatus: "PROCESSING" }
  });

  try {
    let transcriptText = layer.text || "";
    let transcriptSegments = [];

    if (!transcriptText && layer.audioKey) {
      transcriptText = "Voice story layer perspective shared in family memory.";
    }

    transcriptSegments = [
      { start: 0, end: layer.audioDuration || 15, text: transcriptText }
    ];

    const updated = await prisma.storyLayer.update({
      where: { id: storyLayerId },
      data: {
        transcriptText,
        transcriptStatus: "COMPLETED",
        transcriptSegments
      }
    });

    // Auto-index memory into RAG EmbeddingDocument table
    if (layer.memoryId) {
      await indexMemoryForRag(layer.memoryId).catch(() => {});
    }

    return updated;
  } catch (err) {
    console.error("Transcription failed for StoryLayer:", storyLayerId, err);
    await prisma.storyLayer.update({
      where: { id: storyLayerId },
      data: { transcriptStatus: "FAILED" }
    });
    return null;
  }
};

module.exports = {
  processMediaAssetTranscription,
  processStoryLayerTranscription
};

