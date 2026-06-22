const Comment = require("./comment.model");
const CommentReaction = require("./commentReaction.model");
const Memory = require("../memories/memory.model");
const User = require("../user/user.model");
const { getSignedFileUrl } = require("../../services/s3.service");

const getCommentsForMemory = async ({ currentUser, memoryId }) => {
  const comments = await Comment.find({ memoryId }).sort({ createdAt: 1 }).lean();
  if (!comments.length) return [];

  const commentIds = comments.map(c => c._id);
  const userReactions = await CommentReaction.find({
    commentId: { $in: commentIds },
    userFirebaseUid: currentUser.uid
  }).lean();

  const reactionsMap = {};
  userReactions.forEach(ur => {
    reactionsMap[ur.commentId.toString()] = ur.type;
  });

  const ownerUids = Array.from(new Set(comments.map(c => c.ownerFirebaseUid)));
  const users = await User.find({ firebaseUid: { $in: ownerUids } }).lean();
  const usersMap = {};
  for (const u of users) {
    let avatarUrl = u.photoURL || "";
    if (u.photoKey) {
      try {
        avatarUrl = await getSignedFileUrl(u.photoKey);
      } catch (err) {
        console.warn("Failed to get signed URL for user profile during comments fetch:", err.message);
      }
    }
    usersMap[u.firebaseUid] = {
      displayName: u.displayName || u.email?.split("@")[0] || "Alexander Mitchell",
      avatarUrl
    };
  }

  const formattedComments = await Promise.all(comments.map(async (c) => {
    const userMeta = usersMap[c.ownerFirebaseUid] || {
      displayName: c.ownerDisplayName || "Alexander Mitchell",
      avatarUrl: c.ownerAvatarUrl || ""
    };
    
    const timeDiff = Date.now() - new Date(c.createdAt).getTime();
    let timeLabel = "Just now";
    const minutes = Math.floor(timeDiff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) timeLabel = `${days} day${days > 1 ? "s" : ""} ago`;
    else if (hours > 0) timeLabel = `${hours} hour${hours > 1 ? "s" : ""} ago`;
    else if (minutes > 0) timeLabel = `${minutes} minute${minutes > 1 ? "s" : ""} ago`;

    return {
      id: c._id.toString(),
      author: userMeta.displayName,
      avatar: userMeta.avatarUrl,
      text: c.text,
      time: timeLabel,
      reactions: c.reactionsCount || { like: 0, love: 0, haha: 0, wow: 0, sad: 0 },
      userReaction: reactionsMap[c._id.toString()] || null,
      parentCommentId: c.parentCommentId ? c.parentCommentId.toString() : null,
      createdAt: c.createdAt
    };
  }));

  const rootComments = [];
  const repliesMap = {};

  formattedComments.forEach(c => {
    if (c.parentCommentId) {
      if (!repliesMap[c.parentCommentId]) {
        repliesMap[c.parentCommentId] = [];
      }
      repliesMap[c.parentCommentId].push(c);
    } else {
      rootComments.push(c);
    }
  });

  rootComments.forEach(rc => {
    rc.replies = repliesMap[rc.id] || [];
  });

  return rootComments;
};

const createComment = async ({ user, memoryId, text, parentCommentId }) => {
  const memory = await Memory.findById(memoryId);
  if (!memory) {
    const error = new Error("Memory not found");
    error.statusCode = 404;
    throw error;
  }

  // Get user details for commenter metadata
  const userDoc = await User.findOne({ firebaseUid: user.uid }).lean();
  let ownerDisplayName = user.name || user.email?.split("@")[0] || "Alexander Mitchell";
  let ownerAvatarUrl = user.picture || "";

  if (userDoc) {
    ownerDisplayName = userDoc.displayName || ownerDisplayName;
    if (userDoc.photoKey) {
      try {
        ownerAvatarUrl = await getSignedFileUrl(userDoc.photoKey);
      } catch (_) {}
    } else if (userDoc.photoURL) {
      ownerAvatarUrl = userDoc.photoURL;
    }
  }

  const comment = await Comment.create({
    memoryId,
    ownerFirebaseUid: user.uid,
    ownerDisplayName,
    ownerAvatarUrl,
    text,
    parentCommentId: parentCommentId || null
  });

  // Increment comments count on Memory
  await Memory.findByIdAndUpdate(memoryId, { $inc: { comments: 1 } });

  // Update memory snapshot inside Album if it exists
  if (memory.albumId) {
    const albumRepository = require("../albums/album.repository");
    const memoryService = require("../memories/memory.service");
    // Get updated serialized memory
    const updatedMemory = await Memory.findById(memoryId);
    const serializedMemory = await memoryService.getMemoryDetails({ currentUser: user, memoryId });
    
    // We build snap and update in album repo
    const snap = {
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
    };

    await albumRepository.updateMemory({
      albumId: memory.albumId,
      ownerFirebaseUid: memory.ownerFirebaseUid,
      memory: snap,
    });
  }

  return comment;
};

const reactToComment = async ({ user, commentId, type }) => {
  const comment = await Comment.findById(commentId);
  if (!comment) {
    const error = new Error("Comment not found");
    error.statusCode = 404;
    throw error;
  }

  const existingReaction = await CommentReaction.findOne({
    commentId,
    userFirebaseUid: user.uid
  });

  let userReaction = type;

  if (existingReaction) {
    const oldType = existingReaction.type;
    if (oldType === type || !type) {
      // Toggle reaction off
      await CommentReaction.deleteOne({ _id: existingReaction._id });
      
      const updateQuery = {};
      updateQuery[`reactionsCount.${oldType}`] = -1;
      await Comment.findByIdAndUpdate(commentId, { $inc: updateQuery });
      
      userReaction = null;
    } else {
      // Change reaction type
      existingReaction.type = type;
      await existingReaction.save();

      const updateQuery = {};
      updateQuery[`reactionsCount.${oldType}`] = -1;
      updateQuery[`reactionsCount.${type}`] = 1;
      await Comment.findByIdAndUpdate(commentId, { $inc: updateQuery });
    }
  } else if (type) {
    // Add new reaction
    await CommentReaction.create({
      commentId,
      userFirebaseUid: user.uid,
      type
    });

    const updateQuery = {};
    updateQuery[`reactionsCount.${type}`] = 1;
    await Comment.findByIdAndUpdate(commentId, { $inc: updateQuery });
  }

  const updatedComment = await Comment.findById(commentId).lean();
  return {
    reactions: updatedComment.reactionsCount || { like: 0, love: 0, haha: 0, wow: 0, sad: 0 },
    userReaction
  };
};

module.exports = {
  getCommentsForMemory,
  createComment,
  reactToComment
};
