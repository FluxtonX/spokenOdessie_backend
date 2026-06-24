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

const serializeMemory = async (memoryDoc, currentUser = null) => {
  const memory =
    typeof memoryDoc.toObject === "function" ? memoryDoc.toObject() : memoryDoc;

  const mediaListWithUrls = await Promise.all(
    (memory.mediaList || []).map(async (item) => ({
      mediaKey: item.mediaKey,
      thumbnailKey: item.thumbnailKey,
      mediaOriginalName: item.mediaOriginalName || "",
      mediaMimeType: item.mediaMimeType || "",
      mediaUrl: await getSignedFileUrl(item.mediaKey),
      thumbnailUrl: await getSignedFileUrl(item.thumbnailKey),
    }))
  );

  let ownerDisplayName = memory.ownerDisplayName || "";
  let ownerEmail = memory.ownerEmail || "";
  let ownerProfession = "";
  let ownerAvatarUrl = "";

  try {
    const User = require("../user/user.model");
    const userDoc = await User.findOne({ firebaseUid: memory.ownerFirebaseUid }).lean();
    if (userDoc) {
      if (!ownerDisplayName) {
        ownerDisplayName = userDoc.displayName || userDoc.email?.split("@")[0] || "Alexander Mitchell";
      }
      if (!ownerEmail) {
        ownerEmail = userDoc.email || "";
      }
      ownerProfession = userDoc.profession || "";
      if (userDoc.photoKey) {
        ownerAvatarUrl = await getSignedFileUrl(userDoc.photoKey);
      } else {
        ownerAvatarUrl = userDoc.photoURL || "";
      }
    }
  } catch (err) {
    console.warn("Failed to resolve user fallback for memory serialization:", err.message);
  }

  if (!ownerDisplayName) {
    ownerDisplayName = "Alexander Mitchell";
  }

  // Load reactions
  let userReaction = null;
  const reactionsCount = { heart: 0, like: 0, wow: 0, haha: 0, angry: 0 };
  try {
    const PostReaction = require("./postReaction.model");
    if (currentUser) {
      const activeReact = await PostReaction.findOne({
        memoryId: memory._id,
        userFirebaseUid: currentUser.uid || currentUser.firebaseUid
      }).lean();
      if (activeReact) {
        userReaction = activeReact.type;
      }
    }

    const stats = await PostReaction.aggregate([
      { $match: { memoryId: memory._id } },
      { $group: { _id: "$type", count: { $sum: 1 } } }
    ]);
    stats.forEach(s => {
      reactionsCount[s._id] = s.count;
    });
  } catch (err) {
    console.warn("Failed to load reaction stats in serializeMemory:", err.message);
  }

  return {
    id: memory._id.toString(),
    ownerFirebaseUid: memory.ownerFirebaseUid || "",
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
    mediaList: mediaListWithUrls,
    likes: typeof memory.likes === "number" ? memory.likes : 0,
    comments: typeof memory.comments === "number" ? memory.comments : 0,
    shares: typeof memory.shares === "number" ? memory.shares : 0,
    reactions: reactionsCount,
    userReaction,
    color: memory.color || "",
    backgroundId: memory.backgroundId || "none",
    fontId: memory.fontId || "default",
    ownerDisplayName,
    ownerEmail,
    ownerProfession,
    ownerAvatarUrl,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
};

const buildAlbumMemorySnapshot = (serializedMemory) => ({
  id: serializedMemory.id,
  ownerFirebaseUid: serializedMemory.ownerFirebaseUid,
  ownerDisplayName: serializedMemory.ownerDisplayName,
  ownerEmail: serializedMemory.ownerEmail,
  ownerProfession: serializedMemory.ownerProfession,
  ownerAvatarUrl: serializedMemory.ownerAvatarUrl,
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
  shares: serializedMemory.shares,
  reactions: serializedMemory.reactions,
  userReaction: serializedMemory.userReaction,
  color: serializedMemory.color,
  mediaUrl: serializedMemory.mediaUrl,
  thumbnailUrl: serializedMemory.thumbnailUrl,
  mediaKey: serializedMemory.mediaKey,
  mediaMimeType: serializedMemory.mediaMimeType,
  mediaOriginalName: serializedMemory.mediaOriginalName,
  mediaList: serializedMemory.mediaList,
  backgroundId: serializedMemory.backgroundId,
  fontId: serializedMemory.fontId,
  albumTitle: serializedMemory.albumTitle,
});

const getMemoriesByUser = async (currentUser, targetUserId) => {
  const targetUid = targetUserId || currentUser.uid;

  if (targetUid === currentUser.uid) {
    const memories = await memoryRepository.findByOwnerFirebaseUid(currentUser.uid);
    return Promise.all(memories.map((memory) => serializeMemory(memory, currentUser)));
  }

  const User = require("../user/user.model");
  const targetUser = await User.findOne({ firebaseUid: targetUid });
  const isFamily = targetUser?.familyMembers?.includes(currentUser.uid);

  const allowedPrivacy = ["Public"];
  if (isFamily) {
    allowedPrivacy.push("Family Circle");
    allowedPrivacy.push("Family");
  }

  const memories = await memoryRepository.findByOwnerAndPrivacy(targetUid, allowedPrivacy);
  return Promise.all(memories.map((memory) => serializeMemory(memory, currentUser)));
};

const INTEREST_KEYWORDS = {
  travel: ["travel", "trip", "tour", "vacation", "journey", "explore", "adventure", "flight", "hotel", "beach", "mountain"],
  family: ["family", "parent", "mother", "father", "brother", "sister", "grandpa", "grandma", "son", "daughter", "child", "kids"],
  recipes: ["recipe", "cook", "food", "kitchen", "bake", "dinner", "lunch", "breakfast", "delicious", "meal", "dish"],
  milestones: ["milestone", "graduate", "wedding", "marriage", "birth", "anniversary", "birthday", "achievement", "career", "job"],
  reflection: ["reflection", "reflect", "thought", "think", "wisdom", "lesson", "memory", "life", "past", "future"],
  islamic: ["islamic", "ramadan", "eid", "hajj", "allah", "quran", "mosque", "prayer", "dua", "hadith", "sunnah"],
  funny: ["funny", "laugh", "joke", "comedy", "hilarious", "smile", "humor", "fun"],
  sad: ["sad", "cry", "grief", "loss", "miss", "tears", "heartbreak", "sorry"],
  angry: ["angry", "mad", "furious", "hate", "annoyed", "frustrated"]
};

const uploadAndProcessMedia = async (file, userId) => {
  let mediaKey = null;
  let thumbnailKey = null;
  const mediaOriginalName = file.originalname || "";
  const mediaMimeType = file.mimetype || "";

  // 1. Upload Original File
  const uploadResult = await uploadFileToS3({
    file,
    folder: `memories/${userId}`,
  });
  mediaKey = uploadResult.key;

  // 2. Generate Thumbnail if it's a Video
  if (mediaMimeType.startsWith("video/")) {
    const os = require("os");
    const tempDir = os.tmpdir();
    const tempVideoPath = path.join(tempDir, `video-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    const tempThumbPath = path.join(tempDir, `thumb-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`);

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
          folder: `memories/${userId}/thumbs`,
        });
        thumbnailKey = thumbUpload.key;
      }
    } catch (thumbErr) {
      console.error("Thumbnail generation failed:", thumbErr.message);
    } finally {
      // Cleanup temp files
      if (fs.existsSync(tempVideoPath)) {
        try { fs.unlinkSync(tempVideoPath); } catch (e) {}
      }
      if (fs.existsSync(tempThumbPath)) {
        try { fs.unlinkSync(tempThumbPath); } catch (e) {}
      }
    }
  } else if (mediaMimeType.startsWith("image/")) {
    // For images, use the original image as the thumbnail
    thumbnailKey = mediaKey;
  }

  return {
    mediaKey,
    thumbnailKey,
    mediaOriginalName,
    mediaMimeType
  };
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
  backgroundId,
  fontId,
  files,
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

  let mediaUploadWarning = null;
  const uploadedMediaList = [];

  if (files && files.length > 0) {
    for (const f of files) {
      try {
        const mediaItem = await uploadAndProcessMedia(f, user.uid);
        if (mediaItem.mediaKey) {
          uploadedMediaList.push(mediaItem);
        }
      } catch (err) {
        console.error("Failed to upload file:", f.originalname, err);
        mediaUploadWarning = "Failed to upload one or more files.";
      }
    }
  } else if (file) {
    try {
      const mediaItem = await uploadAndProcessMedia(file, user.uid);
      if (mediaItem.mediaKey) {
        uploadedMediaList.push(mediaItem);
      }
    } catch (err) {
      console.error("Failed to upload single file:", err);
      mediaUploadWarning = "Failed to upload the file.";
    }
  }

  // Auto extract tags from title and description
  const contentText = `${normalizedTitle} ${normalizedDescription}`.toLowerCase();
  const autoTags = [];
  for (const [tag, keywords] of Object.entries(INTEREST_KEYWORDS)) {
    if (keywords.some(keyword => contentText.includes(keyword))) {
      autoTags.push(tag);
    }
  }
  const finalTags = Array.from(new Set([...normalizedTags, ...autoTags]));

  const memory = await memoryRepository.create({
    ownerFirebaseUid: user.uid,
    ownerDisplayName: getOwnerDisplayName(user),
    ownerEmail: user.email || "",
    title: normalizedTitle,
    description: normalizedDescription,
    tags: finalTags,
    mood: typeof mood === "string" ? mood.trim() : "",
    privacy: typeof privacy === "string" ? privacy.trim() || "Private" : "Private",
    type: typeof type === "string" ? type.trim() || "Text" : "Text",
    status: normalizedStatus,
    albumId: album ? album._id : null,
    albumTitle: album?.title || "",
    occurredAt: normalizeOccurredAt(occurredAt),
    mediaKey: uploadedMediaList[0]?.mediaKey || null,
    thumbnailKey: uploadedMediaList[0]?.thumbnailKey || null,
    mediaOriginalName: uploadedMediaList[0]?.mediaOriginalName || "",
    mediaMimeType: uploadedMediaList[0]?.mediaMimeType || "",
    mediaList: uploadedMediaList,
    color: typeof color === "string" ? color.trim() : "",
    backgroundId: typeof backgroundId === "string" ? backgroundId.trim() : "none",
    fontId: typeof fontId === "string" ? fontId.trim() : "default",
  });

  const serializedMemory = await serializeMemory(memory, user);

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

const updateMemory = async ({ user, memoryId, title, description, color, backgroundId, fontId, files }) => {
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

  const payload = {
    title: normalizedTitle,
    description: normalizedDescription,
    color: typeof color === "string" ? color.trim() : memory.color || "",
    backgroundId: typeof backgroundId === "string" ? backgroundId.trim() : memory.backgroundId || "none",
    fontId: typeof fontId === "string" ? fontId.trim() : memory.fontId || "default",
  };

  let uploadedMediaList = [];
  if (files && files.length > 0) {
    for (const f of files) {
      try {
        const mediaItem = await uploadAndProcessMedia(f, user.uid);
        if (mediaItem.mediaKey) {
          uploadedMediaList.push(mediaItem);
        }
      } catch (err) {
        console.error("Failed to upload file during update:", f.originalname, err);
      }
    }
    if (uploadedMediaList.length > 0) {
      payload.mediaList = uploadedMediaList;
      payload.mediaKey = uploadedMediaList[0].mediaKey;
      payload.thumbnailKey = uploadedMediaList[0].thumbnailKey;
      payload.mediaOriginalName = uploadedMediaList[0].mediaOriginalName;
      payload.mediaMimeType = uploadedMediaList[0].mediaMimeType;
    }
  }

  const updatedMemory = await memoryRepository.updateByIdAndOwnerFirebaseUid(
    memoryId,
    user.uid,
    payload
  );

  const serializedMemory = await serializeMemory(updatedMemory, user);

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

const getFeedMemories = async ({ user }) => {
  const User = require("../user/user.model");
  const Memory = require("./memory.model");

  const currentUserDoc = await User.findOne({ firebaseUid: user.uid });
  const familyUids = currentUserDoc ? currentUserDoc.familyMembers || [] : [];

  const query = {
    $or: [
      { privacy: "Public", status: "published" },
      {
        privacy: { $in: ["Family Circle", "Family"] },
        status: "published",
        ownerFirebaseUid: { $in: [...familyUids, user.uid] }
      },
      { ownerFirebaseUid: user.uid }
    ]
  };

  const memories = await Memory.find(query).sort({ occurredAt: -1 }).limit(300);

  const recentInteractions = currentUserDoc ? currentUserDoc.recentInteractions || [] : [];
  const interestMap = {};
  const limitTime = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const interaction of recentInteractions) {
    if (new Date(interaction.timestamp).getTime() > limitTime) {
      const tag = interaction.tag.toLowerCase().trim();
      const weight = interaction.weight || 1;
      interestMap[tag] = (interestMap[tag] || 0) + weight;
    }
  }

  const scoredMemories = await Promise.all(
    memories.map(async (memoryDoc) => {
      const serialized = await serializeMemory(memoryDoc, user);
      const ageInHours = (Date.now() - new Date(serialized.date).getTime()) / (1000 * 60 * 60);
      const recencyScore = 100 / (1 + ageInHours);

      let interestScore = 0;
      if (serialized.tags && serialized.tags.length > 0) {
        for (const tag of serialized.tags) {
          const tNorm = tag.toLowerCase().trim();
          if (interestMap[tNorm]) {
            interestScore += interestMap[tNorm];
          }
        }
      }

      const score = recencyScore + interestScore * 50;
      return {
        serialized,
        score
      };
    })
  );

  scoredMemories.sort((a, b) => b.score - a.score);

  return scoredMemories.map(item => item.serialized);
};

const interactWithMemory = async ({ user, memoryId, type }) => {
  const User = require("../user/user.model");
  const Memory = require("./memory.model");

  const memory = await Memory.findById(memoryId);
  if (!memory) {
    const error = new Error("Memory not found for interaction tracking.");
    error.statusCode = 404;
    throw error;
  }

  const tags = memory.tags || [];
  if (tags.length === 0) {
    return { success: true, message: "No tags to track on this memory" };
  }

  const weight = { view: 1, like: 3, comment: 5 }[type] || 1;

  const newInteractions = tags.map(tag => ({
    tag: tag.toLowerCase().trim(),
    timestamp: new Date(),
    weight
  }));

  await User.findOneAndUpdate(
    { firebaseUid: user.uid },
    {
      $push: {
        recentInteractions: {
          $each: newInteractions,
          $slice: -100
        }
      }
    }
  );

  return { success: true };
};

const getMemoryDetails = async ({ currentUser, memoryId }) => {
  const User = require("../user/user.model");
  const Memory = require("./memory.model");

  const memory = await Memory.findById(memoryId);
  if (!memory) {
    const error = new Error("Memory could not be found.");
    error.statusCode = 404;
    throw error;
  }

  if (memory.ownerFirebaseUid === currentUser.uid) {
    return serializeMemory(memory, currentUser);
  }

  if (memory.privacy === "Public") {
    if (memory.status !== "published") {
      const error = new Error("This memory is not published.");
      error.statusCode = 403;
      throw error;
    }
    return serializeMemory(memory, currentUser);
  }

  if (memory.privacy === "Family" || memory.privacy === "Family Circle") {
    if (memory.status !== "published") {
      const error = new Error("This memory is not published.");
      error.statusCode = 403;
      throw error;
    }
    const ownerDoc = await User.findOne({ firebaseUid: memory.ownerFirebaseUid });
    const isFamilyMember = ownerDoc?.familyMembers?.includes(currentUser.uid);
    if (!isFamilyMember) {
      const error = new Error("Access denied: family only.");
      error.statusCode = 403;
      throw error;
    }
    return serializeMemory(memory, currentUser);
  }

  const error = new Error("Access denied: this memory is private.");
  error.statusCode = 403;
  throw error;
};

const reactToMemory = async ({ user, memoryId, type }) => {
  const PostReaction = require("./postReaction.model");
  const Memory = require("./memory.model");

  const memory = await Memory.findById(memoryId);
  if (!memory) {
    const error = new Error("Memory not found");
    error.statusCode = 404;
    throw error;
  }

  const existingReaction = await PostReaction.findOne({
    memoryId,
    userFirebaseUid: user.uid
  });

  let userReaction = type;

  if (existingReaction) {
    const oldType = existingReaction.type;
    if (oldType === type || !type) {
      // Toggle off
      await PostReaction.deleteOne({ _id: existingReaction._id });
      await Memory.findByIdAndUpdate(memoryId, { $inc: { likes: -1 } });
      userReaction = null;
    } else {
      // Change reaction
      existingReaction.type = type;
      await existingReaction.save();
    }
  } else if (type) {
    // Add reaction
    await PostReaction.create({
      memoryId,
      userFirebaseUid: user.uid,
      type
    });
    await Memory.findByIdAndUpdate(memoryId, { $inc: { likes: 1 } });
  }

  // Also log user interaction for personalization matching
  if (type) {
    await interactWithMemory({ user, memoryId, type: "like" });
  }

  const updatedMemory = await Memory.findById(memoryId);
  const serializedMemory = await serializeMemory(updatedMemory, user);
  
  if (updatedMemory.albumId) {
    const albumRepository = require("../albums/album.repository");
    await albumRepository.updateMemory({
      albumId: updatedMemory.albumId,
      ownerFirebaseUid: updatedMemory.ownerFirebaseUid,
      memory: buildAlbumMemorySnapshot(serializedMemory),
    });
  }

  return {
    likes: updatedMemory.likes || 0,
    reactions: serializedMemory.reactions,
    userReaction
  };
};

const shareMemory = async ({ memoryId }) => {
  const Memory = require("./memory.model");

  const memory = await Memory.findById(memoryId);
  if (!memory) {
    const error = new Error("Memory not found");
    error.statusCode = 404;
    throw error;
  }

  await Memory.findByIdAndUpdate(memoryId, { $inc: { shares: 1 } });

  const updatedMemory = await Memory.findById(memoryId);
  const serializedMemory = await serializeMemory(updatedMemory);

  if (updatedMemory.albumId) {
    const albumRepository = require("../albums/album.repository");
    await albumRepository.updateMemory({
      albumId: updatedMemory.albumId,
      ownerFirebaseUid: updatedMemory.ownerFirebaseUid,
      memory: buildAlbumMemorySnapshot(serializedMemory),
    });
  }

  return {
    shares: updatedMemory.shares || 0
  };
};

const getDiscoveryMemories = async ({ user, filter = "for-you", theme }) => {
  const User = require("../user/user.model");
  const Memory = require("./memory.model");

  const currentUserDoc = await User.findOne({ firebaseUid: user.uid });
  const familyUids = currentUserDoc ? currentUserDoc.familyMembers || [] : [];

  let query = {};

  if (filter === "family") {
    // Show ONLY family posts from connected family members and the user themselves
    query = {
      privacy: { $in: ["Family Circle", "Family"] },
      status: "published",
      ownerFirebaseUid: { $in: [...familyUids, user.uid] }
    };
  } else if (filter === "public") {
    query = {
      privacy: "Public",
      status: "published"
    };
  } else if (filter === "themes") {
    query = {
      privacy: "Public",
      status: "published"
    };
    if (theme && theme !== "All") {
      const cleanTheme = theme.trim().toLowerCase();
      const themeParts = cleanTheme.split(" ");
      query.$or = themeParts.map(part => ({
        tags: { $in: [new RegExp(part, "i")] }
      }));
    }
  } else {
    // for-you: show all public memories + connected family memories of connected family members and user themselves
    query = {
      $or: [
        { privacy: "Public", status: "published" },
        {
          privacy: { $in: ["Family Circle", "Family"] },
          status: "published",
          ownerFirebaseUid: { $in: [...familyUids, user.uid] }
        }
      ]
    };
  }

  // Execute query and serialize
  const memories = await Memory.find(query).sort({ occurredAt: -1 }).limit(100);
  return Promise.all(memories.map((m) => serializeMemory(m, user)));
};

module.exports = {
  serializeMemory,
  getMemoriesByUser,
  createMemory,
  updateMemory,
  deleteMemory,
  getFeedMemories,
  interactWithMemory,
  getMemoryDetails,
  reactToMemory,
  shareMemory,
  getDiscoveryMemories,
};
