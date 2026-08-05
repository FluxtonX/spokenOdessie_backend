const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const memoryRepository = require("./memory.repository");
const prisma = require("../../config/prisma");
const { uploadFileToS3, getSignedFileUrl } = require("../../services/s3.service");

ffmpeg.setFfmpegPath(ffmpegPath);

const getOwnerDisplayName = (user) => {
  if (user.displayName && user.displayName.trim()) {
    return user.displayName.trim();
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
  if (!memoryDoc) return null;

  const memory = { ...memoryDoc };

  let mediaListWithUrls = [];
  if (memory.mediaList) {
    let parsedMedia = [];
    try {
      parsedMedia = typeof memory.mediaList === "string" ? JSON.parse(memory.mediaList) : memory.mediaList;
    } catch (_) {}
    if (Array.isArray(parsedMedia)) {
      mediaListWithUrls = await Promise.all(
        parsedMedia.map(async (item) => ({
          ...item,
          mediaUrl: await getSignedFileUrl(item.mediaKey),
          thumbnailUrl: await getSignedFileUrl(item.thumbnailKey),
        }))
      );
    }
  }

  let ownerDisplayName = memory.ownerDisplayName || "";
  let ownerEmail = memory.ownerEmail || "";
  let ownerProfession = "";
  let ownerAvatarUrl = "";

  try {
    const userDoc = await prisma.user.findUnique({
      where: { id: memory.ownerId }
    });
    if (userDoc) {
      ownerDisplayName = userDoc.displayName || userDoc.email.split("@")[0] || "Alexander Mitchell";
      ownerEmail = userDoc.email || "";
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
  const reactionsCount = { heart: 0, like: 0, care: 0, haha: 0, wow: 0, angry: 0 };
  let totalDbReactions = 0;
  
  try {
    if (currentUser) {
      const currentUserId = currentUser.id || currentUser.uid || currentUser.sub;
      if (currentUserId) {
        const activeReact = await prisma.postReaction.findUnique({
          where: {
            memoryId_userId: {
              memoryId: memory.id,
              userId: currentUserId,
            }
          }
        });
        if (activeReact) {
          userReaction = activeReact.type;
        }
      }
    }

    const allReactions = await prisma.postReaction.findMany({
      where: { memoryId: memory.id }
    });
    
    totalDbReactions = allReactions.length;
    allReactions.forEach(r => {
      const typeKey = (r.type || "heart").toLowerCase();
      reactionsCount[typeKey] = (reactionsCount[typeKey] || 0) + 1;
    });
  } catch (err) {
    console.warn("Failed to load reaction stats in serializeMemory:", err.message);
  }

  const finalTotalReactions = totalDbReactions;

  return {
    id: memory.id,
    ownerFirebaseUid: memory.ownerId || "",
    ownerId: memory.ownerId || "",
    title: memory.title,
    description: memory.description || "",
    tags: Array.isArray(memory.tags) ? memory.tags : [],
    mood: memory.mood || "",
    category: memory.privacy || "Private",
    privacy: memory.privacy || "Private",
    type: memory.type || "Text",
    status: memory.status || "draft",
    albumId: memory.albumId || null,
    albumTitle: memory.albumTitle || "",
    date: memory.occurredAt,
    mediaKey: memory.mediaKey || null,
    mediaMimeType: memory.mediaMimeType || "",
    mediaOriginalName: memory.mediaOriginalName || "",
    mediaUrl: await getSignedFileUrl(memory.mediaKey),
    thumbnailUrl: await getSignedFileUrl(memory.thumbnailKey),
    mediaList: mediaListWithUrls,
    likes: finalTotalReactions,
    totalReactions: finalTotalReactions,
    commentsCount: typeof memory.commentsCount === "number" ? memory.commentsCount : 0,
    comments: Array.isArray(memory.comments) ? memory.comments : [],
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

const getMemoriesByUser = async (currentUser, targetUserId) => {
  const currentUserId = currentUser?.id || currentUser?.uid || currentUser?.sub;
  const targetUid = targetUserId || currentUserId;

  if (!targetUid) {
    return [];
  }

  const memories = await memoryRepository.findByOwnerFirebaseUid(targetUid);

  // Filter out Private memories if requester is not the owner
  const isOwner = currentUserId && (currentUserId === targetUid);
  const filteredMemories = isOwner
    ? memories
    : memories.filter(m => {
        const p = String(m.privacy || "Public").toLowerCase();
        return p !== "private";
      });

  return Promise.all(filteredMemories.map((memory) => serializeMemory(memory, currentUser)));
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
  mediaKey,
  mediaMimeType,
  mediaOriginalName,
  mediaList,
}) => {
  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  const normalizedDescription = typeof description === "string" ? description.trim() : "";
  const normalizedStatus = normalizeStatus(status);
  const normalizedTags = normalizeTags(tags);

  if (!normalizedTitle) {
    const error = new Error("Memory title is required.");
    error.statusCode = 400;
    throw error;
  }

  let album = null;
  if (albumId) {
    album = await prisma.album.findFirst({
      where: { id: albumId, ownerId: user.id }
    });
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
        const mediaItem = await uploadAndProcessMedia(f, user.id);
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
      const mediaItem = await uploadAndProcessMedia(file, user.id);
      if (mediaItem.mediaKey) {
        uploadedMediaList.push(mediaItem);
      }
    } catch (err) {
      console.error("Failed to upload single file:", err);
      mediaUploadWarning = "Failed to upload the file.";
    }
  } else if (mediaKey) {
    uploadedMediaList.push({
      mediaKey,
      thumbnailKey: null,
      mediaOriginalName: mediaOriginalName || "file",
      mediaMimeType: mediaMimeType || "",
    });
  } else if (mediaList) {
    const list = typeof mediaList === "string" ? JSON.parse(mediaList) : mediaList;
    if (Array.isArray(list)) {
      uploadedMediaList.push(...list);
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

  const userDoc = await prisma.user.findUnique({ where: { id: user.id } });

  const memory = await memoryRepository.create({
    ownerFirebaseUid: user.id,
    ownerDisplayName: getOwnerDisplayName(userDoc || user),
    ownerEmail: user.email || userDoc?.email || "",
    title: normalizedTitle,
    description: normalizedDescription,
    tags: finalTags,
    mood: typeof mood === "string" ? mood.trim() : "",
    privacy: typeof privacy === "string" ? privacy.trim() || "Private" : "Private",
    type: typeof type === "string" ? type.trim() || "Text" : "Text",
    status: normalizedStatus,
    albumId: album ? album.id : null,
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
    await prisma.album.update({
      where: { id: album.id },
      data: { entries: { increment: 1 } }
    });
  }

  if (mediaUploadWarning) {
    serializedMemory.mediaUploadWarning = mediaUploadWarning;
  }

  return serializedMemory;
};

const updateMemory = async ({
  user,
  memoryId,
  title,
  description,
  privacy,
  tags,
  mood,
  status,
  occurredAt,
  albumId,
  color,
  backgroundId,
  fontId,
  files,
  mediaKey,
  mediaMimeType,
  mediaOriginalName,
  mediaList,
}) => {
  let memory = await memoryRepository.findByIdAndOwnerFirebaseUid(
    memoryId,
    user.id
  );

  // Fallback lookup if client passed temporary/legacy ID
  if (!memory && title && typeof title === "string") {
    memory = await prisma.memory.findFirst({
      where: { ownerId: user.id, title: { mode: "insensitive", equals: title.trim() } }
    });
  }

  if (!memory) {
    const error = new Error("Memory could not be found.");
    error.statusCode = 404;
    throw error;
  }

  const normalizedTitle = typeof title === "string" ? title.trim() : memory.title || "";
  const normalizedDescription = typeof description === "string" ? description.trim() : memory.description || "";

  if (!normalizedTitle) {
    const error = new Error("Memory title is required.");
    error.statusCode = 400;
    throw error;
  }

  let album = null;
  if (albumId) {
    album = await prisma.album.findFirst({
      where: { id: albumId, ownerId: user.id }
    });
  }

  // Parse tags
  let parsedTags = memory.tags || [];
  if (Array.isArray(tags)) {
    parsedTags = tags.map(t => String(t).trim().toLowerCase()).filter(Boolean);
  } else if (typeof tags === "string") {
    try {
      const arr = JSON.parse(tags);
      if (Array.isArray(arr)) parsedTags = arr.map(t => String(t).trim().toLowerCase()).filter(Boolean);
      else parsedTags = tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    } catch (_) {
      parsedTags = tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    }
  }

  // Auto extract tags from title and description
  const contentText = `${normalizedTitle} ${normalizedDescription}`.toLowerCase();
  const autoTags = [];
  for (const [tagKey, keywords] of Object.entries(INTEREST_KEYWORDS)) {
    if (keywords.some(keyword => contentText.includes(keyword))) {
      autoTags.push(tagKey);
    }
  }
  const finalTags = Array.from(new Set([...parsedTags, ...autoTags]));

  const payload = {
    title: normalizedTitle,
    description: normalizedDescription,
    privacy: typeof privacy === "string" ? privacy.trim() : memory.privacy || "Public",
    tags: finalTags,
    mood: typeof mood === "string" ? mood.trim() : memory.mood || "",
    status: typeof status === "string" ? status.trim() : memory.status || "published",
    color: typeof color === "string" ? color.trim() : memory.color || "",
    backgroundId: typeof backgroundId === "string" ? backgroundId.trim() : memory.backgroundId || "none",
    fontId: typeof fontId === "string" ? fontId.trim() : memory.fontId || "default",
  };

  if (album) {
    payload.albumId = album.id;
    payload.albumTitle = album.title;
  }

  if (occurredAt) {
    payload.occurredAt = normalizeOccurredAt(occurredAt);
  }

  let uploadedMediaList = [];
  if (files && files.length > 0) {
    for (const f of files) {
      try {
        const mediaItem = await uploadAndProcessMedia(f, user.id);
        if (mediaItem.mediaKey) {
          uploadedMediaList.push(mediaItem);
        }
      } catch (err) {
        console.error("Failed to upload file during update:", f.originalname, err);
      }
    }
  } else if (mediaKey) {
    uploadedMediaList.push({
      mediaKey,
      thumbnailKey: null,
      mediaOriginalName: mediaOriginalName || "file",
      mediaMimeType: mediaMimeType || "",
    });
  } else if (mediaList) {
    const list = typeof mediaList === "string" ? JSON.parse(mediaList) : mediaList;
    if (Array.isArray(list)) {
      uploadedMediaList.push(...list);
    }
  }

  if (uploadedMediaList.length > 0) {
    payload.mediaList = uploadedMediaList;
    payload.mediaKey = uploadedMediaList[0].mediaKey;
    payload.thumbnailKey = uploadedMediaList[0].thumbnailKey;
    payload.mediaOriginalName = uploadedMediaList[0].mediaOriginalName;
    payload.mediaMimeType = uploadedMediaList[0].mediaMimeType;
  }

  const updatedMemory = await memoryRepository.updateByIdAndOwnerFirebaseUid(
    memory.id,
    user.id,
    payload
  );

  return serializeMemory(updatedMemory, user);
};

const deleteMemory = async ({ user, memoryId }) => {
  const memory = await memoryRepository.findByIdAndOwnerFirebaseUid(
    memoryId,
    user.id
  );

  if (!memory) {
    const error = new Error("Memory could not be found.");
    error.statusCode = 404;
    throw error;
  }

  await memoryRepository.deleteByIdAndOwnerFirebaseUid(memoryId, user.id);

  if (memory.albumId) {
    await prisma.album.update({
      where: { id: memory.albumId },
      data: { entries: { decrement: 1 } }
    });
  }

  return { id: memoryId };
};

const getFeedMemories = async ({ user }) => {
  const userDoc = await prisma.user.findUnique({ where: { id: user.id } });
  
  // Get family connections
  const connections = await prisma.familyConnection.findMany({
    where: {
      OR: [
        { user1Id: user.id },
        { user2Id: user.id }
      ]
    }
  });
  const familyUids = connections.map(c => c.user1Id === user.id ? c.user2Id : c.user1Id);

  // Fetch feed memories dynamically
  const memories = await prisma.memory.findMany({
    where: {
      OR: [
        { privacy: "Public", status: "published" },
        {
          privacy: { in: ["Family Circle", "Family"] },
          status: "published",
          ownerId: { in: [...familyUids, user.id] }
        },
        { ownerId: user.id }
      ]
    },
    orderBy: { occurredAt: "desc" },
    take: 300
  });

  let recentInteractions = [];
  try {
    recentInteractions = typeof userDoc?.recentInteractions === "string" 
      ? JSON.parse(userDoc.recentInteractions) 
      : userDoc?.recentInteractions || [];
  } catch (_) {}

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
  const memory = await prisma.memory.findUnique({
    where: { id: memoryId }
  });
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

  const userDoc = await prisma.user.findUnique({ where: { id: user.id } });
  let interactions = [];
  try {
    interactions = typeof userDoc.recentInteractions === "string" 
      ? JSON.parse(userDoc.recentInteractions) 
      : userDoc.recentInteractions || [];
  } catch (_) {}
  if (!Array.isArray(interactions)) interactions = [];

  interactions = [...interactions, ...newInteractions].slice(-100);

  await prisma.user.update({
    where: { id: user.id },
    data: { recentInteractions: interactions }
  });

  return { success: true };
};

const getMemoryDetails = async ({ currentUser, memoryId }) => {
  const memory = await prisma.memory.findUnique({
    where: { id: memoryId }
  });
  if (!memory) {
    const error = new Error("Memory could not be found.");
    error.statusCode = 404;
    throw error;
  }

  const currentUserId = currentUser?.id || currentUser?.uid || currentUser?.sub;

  if (currentUserId && memory.ownerId === currentUserId) {
    return serializeMemory(memory, currentUser);
  }

  // Only block explicitly archived memories for non-owners
  if (memory.status === "archived") {
    const error = new Error("This memory is archived.");
    error.statusCode = 403;
    throw error;
  }

  const privacyStr = String(memory.privacy || "Public").toLowerCase();

  if (privacyStr === "public" || privacyStr === "everyone") {
    return serializeMemory(memory, currentUser);
  }

  if (privacyStr === "family" || privacyStr === "family circle") {
    let isFamily = false;
    if (currentUserId) {
      try {
        const [u1, u2] = [currentUserId, memory.ownerId].sort();
        const familyConnection = await prisma.familyConnection.findUnique({
          where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } }
        });
        isFamily = !!familyConnection;
      } catch (_) {}
    }
    
    // For public profile/discovery views, allow family memories to be viewable in modal
    return serializeMemory(memory, currentUser);
  }

  const error = new Error("Access denied: this memory is private.");
  error.statusCode = 403;
  throw error;
};

const VALID_REACTION_TYPES = ["heart", "like", "care", "haha", "wow", "angry"];

const reactToMemory = async ({ user, memoryId, type }) => {
  const userId = user?.id || user?.uid || user?.sub;
  if (!userId) {
    const error = new Error("User authentication required to react");
    error.statusCode = 401;
    throw error;
  }

  let cleanType = type ? String(type).toLowerCase().trim() : null;
  if (cleanType && !VALID_REACTION_TYPES.includes(cleanType)) {
    cleanType = "heart";
  }

  // Execute all reaction operations atomically inside a single ACID transaction
  const result = await prisma.$transaction(async (tx) => {
    const memory = await tx.memory.findUnique({
      where: { id: memoryId }
    });
    if (!memory) {
      const error = new Error("Memory not found");
      error.statusCode = 404;
      throw error;
    }

    const existingReaction = await tx.postReaction.findUnique({
      where: {
        memoryId_userId: {
          memoryId,
          userId
        }
      }
    });

    let finalUserReaction = null;
    let wasAdded = false;

    if (existingReaction) {
      if (existingReaction.type === cleanType || !cleanType) {
        // Toggle off: Delete reaction record
        await tx.postReaction.delete({
          where: { id: existingReaction.id }
        });
        finalUserReaction = null;
      } else {
        // Update reaction type
        await tx.postReaction.update({
          where: { id: existingReaction.id },
          data: { type: cleanType }
        });
        finalUserReaction = cleanType;
        wasAdded = true;
      }
    } else if (cleanType) {
      // Create new reaction (guaranteed unique by (memoryId, userId) constraint)
      await tx.postReaction.create({
        data: {
          memoryId,
          userId,
          type: cleanType
        }
      });
      finalUserReaction = cleanType;
      wasAdded = true;
    }

    // Re-aggregate exact counts directly from DB inside transaction
    const allReactions = await tx.postReaction.findMany({
      where: { memoryId }
    });

    const reactionsCount = { heart: 0, like: 0, care: 0, haha: 0, wow: 0, angry: 0 };
    allReactions.forEach(r => {
      const typeKey = (r.type || "heart").toLowerCase();
      reactionsCount[typeKey] = (reactionsCount[typeKey] || 0) + 1;
    });

    const totalReactions = allReactions.length;

    // Sync Memory.likes counter to exact DB count inside transaction
    await tx.memory.update({
      where: { id: memoryId },
      data: { likes: totalReactions }
    });

    return {
      userReaction: finalUserReaction,
      totalReactions,
      likes: totalReactions,
      reactions: reactionsCount,
      wasAdded
    };
  });

  // Track interaction event only if a new reaction was added/changed (not toggled off)
  if (result.wasAdded) {
    try {
      await interactWithMemory({ user, memoryId, type: "like" });
    } catch (_) {}
  }

  return {
    userReaction: result.userReaction,
    totalReactions: result.totalReactions,
    likes: result.likes,
    reactions: result.reactions
  };
};

const shareMemory = async ({ memoryId }) => {
  const updatedMemory = await prisma.memory.update({
    where: { id: memoryId },
    data: { shares: { increment: 1 } }
  });

  return {
    shares: updatedMemory.shares || 0
  };
};

const getDiscoveryMemories = async ({ user, filter = "public", theme, q, page = 1, limit = 20 }) => {
  let query = {};

  const cleanTheme = (theme || "").trim();
  const cleanFilter = (filter || "").trim();
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

  // Fetch current user's following list & family connections for recommendation scoring
  let myFollowingUids = [];
  let myFamilyUids = [];
  if (user?.id) {
    try {
      const [follows, connections] = await Promise.all([
        prisma.follow.findMany({ where: { followerId: user.id }, select: { followingId: true } }),
        prisma.familyConnection.findMany({
          where: { OR: [{ user1Id: user.id }, { user2Id: user.id }] }
        })
      ]);
      myFollowingUids = follows.map(f => f.followingId);
      myFamilyUids = connections.map(c => c.user1Id === user.id ? c.user2Id : c.user1Id);
    } catch (_) {}
  }

  // Explicit Public Privacy Clause (matches "Public", "public", or "everyone")
  const publicPrivacyClause = {
    OR: [
      { privacy: { mode: "insensitive", contains: "public" } },
      { privacy: { mode: "insensitive", contains: "everyone" } },
      { privacy: "Public" },
      { privacy: "public" },
    ]
  };

  // If user selected Family filter
  if (cleanTheme === "Family" || cleanFilter.toLowerCase() === "family") {
    let familyOwnerIds = [...myFamilyUids];
    if (user?.id) familyOwnerIds.push(user.id);

    if (familyOwnerIds.length > 0) {
      query.OR = [
        { ownerId: { in: familyOwnerIds } },
        { tags: { hasSome: ["family"] } },
        { privacy: { mode: "insensitive", contains: "family" } }
      ];
    } else {
      query.OR = [
        { tags: { hasSome: ["family"] } },
        { privacy: { mode: "insensitive", contains: "family" } }
      ];
    }
  } else {
    // Show 100% Public Memories Only across all database users
    query = { ...publicPrivacyClause };
  }

  const conditions = [];

  if (cleanTheme && cleanTheme !== "All" && cleanTheme !== "All Stories" && cleanTheme !== "Family") {
    let themeLower = cleanTheme.toLowerCase().replace(/stories|recordings/g, "").trim();
    if (!themeLower) themeLower = cleanTheme.toLowerCase();
    const themeParts = cleanTheme.toLowerCase().split(/\s+/).map(p => p.trim()).filter(Boolean);

    if (themeLower === "visual" || themeLower === "photo" || themeLower === "image") {
      // Visual Stories filter: fetch BOTH photo and video memories
      conditions.push({
        OR: [
          { type: { in: ["photo", "Photo", "PHOTO", "visual", "Visual", "image", "Image", "video", "Video", "VIDEO"] } },
          { mediaMimeType: { startsWith: "image/" } },
          { mediaMimeType: { startsWith: "video/" } },
          { mediaKey: { contains: ".mp4" } },
          { mediaKey: { contains: ".webm" } },
          { mediaKey: { contains: ".mov" } },
          { mediaKey: { contains: ".jpg" } },
          { mediaKey: { contains: ".jpeg" } },
          { mediaKey: { contains: ".png" } },
          { tags: { hasSome: ["visual", "photo", "video", "image"] } },
          { title: { contains: "photo", mode: "insensitive" } },
          { title: { contains: "video", mode: "insensitive" } },
          { title: { contains: "visual", mode: "insensitive" } },
        ]
      });
    } else if (themeLower === "video") {
      conditions.push({
        OR: [
          { type: { in: ["video", "Video", "VIDEO"] } },
          { mediaMimeType: { startsWith: "video/" } },
          { mediaKey: { contains: ".mp4" } },
          { mediaKey: { contains: ".webm" } },
          { mediaKey: { contains: ".mov" } },
          { tags: { hasSome: ["video"] } },
          { title: { contains: "video", mode: "insensitive" } }
        ]
      });
    } else {
      let typeMatches = [themeLower, themeLower.charAt(0).toUpperCase() + themeLower.slice(1)];
      if (themeLower === "voice" || themeLower === "audio" || themeLower === "recording") {
        typeMatches = ["voice", "Voice", "VOICE", "audio", "Audio", "AUDIO"];
      } else if (themeLower === "written" || themeLower === "text" || themeLower === "journal") {
        typeMatches = ["written", "Written", "text", "Text", "thought", "Thought", "journal", "Journal", "milestone", "Milestone"];
      }
      
      conditions.push({
        OR: [
          { type: { in: typeMatches } },
          { tags: { hasSome: themeParts } },
          { title: { contains: themeLower, mode: "insensitive" } },
          { description: { contains: themeLower, mode: "insensitive" } },
          { mood: { contains: themeLower, mode: "insensitive" } },
        ]
      });
    }
  }

  if (q && q.trim()) {
    const keywords = q.trim().split(/\s+/).filter(Boolean);
    const searchConditions = keywords.flatMap((kw) => {
      const cleanKw = kw.replace(/^#/, "").toLowerCase();
      return [
        { title: { contains: cleanKw, mode: "insensitive" } },
        { description: { contains: cleanKw, mode: "insensitive" } },
        { mood: { contains: cleanKw, mode: "insensitive" } },
        { tags: { hasSome: [cleanKw] } },
        { owner: { is: { displayName: { contains: cleanKw, mode: "insensitive" } } } },
      ];
    });
    conditions.push({ OR: searchConditions });
  }

  if (conditions.length > 0) {
    if (query.OR) {
      query = {
        AND: [
          { OR: query.OR },
          ...conditions
        ]
      };
    } else {
      query.AND = conditions;
    }
  }

  // Count total matching memories
  const totalCount = await prisma.memory.count({ where: query });

  // Execute query with owner relation and fetch all matching candidate memories
  const candidateMemories = await prisma.memory.findMany({
    where: query,
    include: {
      owner: true
    },
    orderBy: { createdAt: "desc" }
  });

  // Calculate recommendation scores for social ranking
  const scoredMemories = candidateMemories.map((m) => {
    const isFollowed = myFollowingUids.includes(m.ownerId);
    const isFamily = myFamilyUids.includes(m.ownerId);
    const engagementScore = (m.likes || 0) * 3 + (m.commentsCount || 0) * 5 + (m.shares || 0) * 4;
    const affinityScore = (isFollowed ? 50 : 0) + (isFamily ? 40 : 0);
    
    // Recency score (newer memories score higher)
    const ageInHours = (Date.now() - new Date(m.createdAt).getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 100 - ageInHours);

    return {
      memory: m,
      score: engagementScore + affinityScore + recencyScore
    };
  });

  // Rank by score descending
  scoredMemories.sort((a, b) => b.score - a.score);

  // Apply pagination
  const startIndex = (pageNum - 1) * pageSize;
  const paginatedMemories = scoredMemories.slice(startIndex, startIndex + pageSize).map(item => item.memory);

  const serializedList = await Promise.all(paginatedMemories.map((m) => serializeMemory(m, user)));

  return {
    memories: serializedList,
    page: pageNum,
    limit: pageSize,
    total: totalCount,
    hasMore: startIndex + pageSize < totalCount
  };
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
