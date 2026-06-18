const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const memoryRepository = require("./memory.repository");
const albumRepository = require("../albums/album.repository");
const { uploadFileToS3, getSignedFileUrl } = require("../../services/s3.service");

ffmpeg.setFfmpegPath(ffmpegPath);

const getOwnerDisplayName = (user) => {
  if (user.name && user.name.trim()) {
    return user.name.trim();
  }

  if (user.email) {
    return user.email.split("@")[0];
  }

  return "Spoken Odyssey User";
};

const normalizeTags = (rawTags) => {
  if (Array.isArray(rawTags)) {
    return rawTags
      .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
      .filter(Boolean);
  }

  if (typeof rawTags === "string" && rawTags.trim()) {
    try {
      const parsed = JSON.parse(rawTags);
      if (Array.isArray(parsed)) {
        return parsed
          .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
          .filter(Boolean);
      }
    } catch (_) {
      return rawTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
  }

  return [];
};

const normalizeStatus = (status) =>
  typeof status === "string" && status.toLowerCase() === "published"
    ? "published"
    : "draft";

const normalizeOccurredAt = (dateValue) => {
  if (!dateValue) {
    return new Date();
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
};

const serializeMemory = async (memoryDoc) => {
  const memory =
    typeof memoryDoc.toObject === "function" ? memoryDoc.toObject() : memoryDoc;

  return {
    id: memory._id.toString(),
    title: memory.title,
    description: memory.description || "",
    tags: Array.isArray(memory.tags) ? memory.tags : [],
    mood: memory.mood || "",
    category: memory.privacy || "Private",
    privacy: memory.privacy || "Private",
    type: memory.type || "Text",
    status: memory.status || "draft",
    albumId: memory.albumId ? memory.albumId.toString() : null,
    albumTitle: memory.albumTitle || "",
    date: memory.occurredAt,
    mediaKey: memory.mediaKey || null,
    mediaMimeType: memory.mediaMimeType || "",
    mediaOriginalName: memory.mediaOriginalName || "",
    mediaUrl: await getSignedFileUrl(memory.mediaKey),
    thumbnailUrl: await getSignedFileUrl(memory.thumbnailKey),
    likes: typeof memory.likes === "number" ? memory.likes : 0,
    comments: typeof memory.comments === "number" ? memory.comments : 0,
    color: memory.color || "",
    ownerDisplayName: memory.ownerDisplayName || "",
    ownerEmail: memory.ownerEmail || "",
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
};

const buildAlbumMemorySnapshot = (serializedMemory) => ({
  id: serializedMemory.id,
  title: serializedMemory.title,
  description: serializedMemory.description,
  tags: serializedMemory.tags,
  category: serializedMemory.category,
  privacy: serializedMemory.privacy,
  type: serializedMemory.type,
  mood: serializedMemory.mood,
  date: serializedMemory.date,
  likes: serializedMemory.likes,
  comments: serializedMemory.comments,
  color: serializedMemory.color,
  mediaUrl: serializedMemory.mediaUrl,
  thumbnailUrl: serializedMemory.thumbnailUrl,
  mediaKey: serializedMemory.mediaKey,
  mediaMimeType: serializedMemory.mediaMimeType,
  mediaOriginalName: serializedMemory.mediaOriginalName,
});

const getMemoriesByUser = async (user) => {
  const memories = await memoryRepository.findByOwnerFirebaseUid(user.uid);
  return Promise.all(memories.map((memory) => serializeMemory(memory)));
};

const createMemory = async ({
  user,
  title,
  description,
  tags,
  mood,
  privacy,
  type,
  status,
  albumId,
  occurredAt,
  color,
  file,
}) => {
  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  const normalizedDescription =
    typeof description === "string" ? description.trim() : "";
  const normalizedStatus = normalizeStatus(status);
  const normalizedTags = normalizeTags(tags);

  if (!normalizedTitle) {
    const error = new Error("Memory title is required.");
    error.statusCode = 400;
    throw error;
  }

  let album = null;
  if (albumId) {
    album = await albumRepository.findByIdAndOwnerFirebaseUid(albumId, user.uid);
    if (!album) {
      const error = new Error("Selected album could not be found.");
      error.statusCode = 404;
      throw error;
    }
  }

  let mediaKey = null;
  let thumbnailKey = null;
  let mediaOriginalName = "";
  let mediaMimeType = "";
  let mediaUploadWarning = null;

  if (file) {
    try {
      // 1. Upload Original File
      const upload = await uploadFileToS3({
        file,
        folder: `memories/${user.uid}`,
      });
      mediaKey = upload.key;
      mediaOriginalName = file.originalname || "";
      mediaMimeType = file.mimetype || "";

      // 2. Generate Thumbnail if it's a Video
      if (mediaMimeType.startsWith("video/")) {
        const tempVideoPath = path.join("/tmp", `${Date.now()}-temp-video`);
        const tempThumbPath = path.join("/tmp", `${Date.now()}-thumb.jpg`);

        try {
          fs.writeFileSync(tempVideoPath, file.buffer);

          await new Promise((resolve, reject) => {
            ffmpeg(tempVideoPath)
              .screenshots({
                timestamps: [1],
                folder: path.dirname(tempThumbPath),
                filename: path.basename(tempThumbPath),
                size: "640x?",
              })
              .on("end", resolve)
              .on("error", reject);
          });

          if (fs.existsSync(tempThumbPath)) {
            const thumbBuffer = fs.readFileSync(tempThumbPath);
            const thumbUpload = await uploadFileToS3({
              file: {
                buffer: thumbBuffer,
                originalname: `${mediaOriginalName}-thumb.jpg`,
                mimetype: "image/jpeg",
              },
              folder: `memories/${user.uid}/thumbs`,
            });
            thumbnailKey = thumbUpload.key;
          }
        } catch (thumbErr) {
          console.error("Thumbnail generation failed:", thumbErr.message);
        } finally {
          // Cleanup temp files
          if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
          if (fs.existsSync(tempThumbPath)) fs.unlinkSync(tempThumbPath);
        }
      } else if (mediaMimeType.startsWith("image/")) {
        // For images, use the original image as the thumbnail
        thumbnailKey = mediaKey;
      }
    } catch (error) {
      mediaUploadWarning =
        error.message ||
        "Memory was saved, but the media file could not be uploaded.";
      console.error("Memory media upload warning:", mediaUploadWarning);
    }
  }

  const memory = await memoryRepository.create({
    ownerFirebaseUid: user.uid,
    ownerDisplayName: getOwnerDisplayName(user),
    ownerEmail: user.email || "",
    title: normalizedTitle,
    description: normalizedDescription,
    tags: normalizedTags,
    mood: typeof mood === "string" ? mood.trim() : "",
    privacy: typeof privacy === "string" ? privacy.trim() || "Private" : "Private",
    type: typeof type === "string" ? type.trim() || "Text" : "Text",
    status: normalizedStatus,
    albumId: album ? album._id : null,
    albumTitle: album?.title || "",
    occurredAt: normalizeOccurredAt(occurredAt),
    mediaKey,
    thumbnailKey,
    mediaOriginalName,
    mediaMimeType,
    color: typeof color === "string" ? color.trim() : "",
  });

  const serializedMemory = await serializeMemory(memory);

  if (normalizedStatus === "published" && album) {
    await albumRepository.addMemory({
      albumId: album._id,
      ownerFirebaseUid: user.uid,
      memory: buildAlbumMemorySnapshot(serializedMemory),
    });
  }

  if (mediaUploadWarning) {
    serializedMemory.mediaUploadWarning = mediaUploadWarning;
  }

  return serializedMemory;
};

const updateMemory = async ({ user, memoryId, title, description, color }) => {
  const memory = await memoryRepository.findByIdAndOwnerFirebaseUid(
    memoryId,
    user.uid
  );

  if (!memory) {
    const error = new Error("Memory could not be found.");
    error.statusCode = 404;
    throw error;
  }

  const normalizedTitle =
    typeof title === "string" ? title.trim() : memory.title || "";
  const normalizedDescription =
    typeof description === "string"
      ? description.trim()
      : memory.description || "";

  if (!normalizedTitle) {
    const error = new Error("Memory title is required.");
    error.statusCode = 400;
    throw error;
  }

  const updatedMemory = await memoryRepository.updateByIdAndOwnerFirebaseUid(
    memoryId,
    user.uid,
    {
      title: normalizedTitle,
      description: normalizedDescription,
      color: typeof color === "string" ? color.trim() : memory.color || "",
    }
  );

  const serializedMemory = await serializeMemory(updatedMemory);

  if (updatedMemory.albumId) {
    await albumRepository.updateMemory({
      albumId: updatedMemory.albumId,
      ownerFirebaseUid: user.uid,
      memory: buildAlbumMemorySnapshot(serializedMemory),
    });
  }

  return serializedMemory;
};

const deleteMemory = async ({ user, memoryId }) => {
  const memory = await memoryRepository.findByIdAndOwnerFirebaseUid(
    memoryId,
    user.uid
  );

  if (!memory) {
    const error = new Error("Memory could not be found.");
    error.statusCode = 404;
    throw error;
  }

  await memoryRepository.deleteByIdAndOwnerFirebaseUid(memoryId, user.uid);

  if (memory.albumId) {
    await albumRepository.removeMemory({
      albumId: memory.albumId,
      ownerFirebaseUid: user.uid,
      memoryId,
    });
  }

  return { id: memoryId };
};

module.exports = {
  getMemoriesByUser,
  createMemory,
  updateMemory,
  deleteMemory,
};
