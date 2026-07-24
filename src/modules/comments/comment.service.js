const prisma = require("../../config/prisma");
const { getSignedFileUrl } = require("../../services/s3.service");

const getCommentsForMemory = async ({ currentUser, memoryId }) => {
  const comments = await prisma.comment.findMany({
    where: { memoryId },
    orderBy: { createdAt: "asc" }
  });
  
  if (!comments.length) return [];

  const commentIds = comments.map(c => c.id);
  
  const userReactions = await prisma.commentReaction.findMany({
    where: {
      commentId: { in: commentIds },
      userId: currentUser.id
    }
  });

  const reactionsMap = {};
  userReactions.forEach(ur => {
    reactionsMap[ur.commentId] = ur.type;
  });

  const ownerIds = Array.from(new Set(comments.map(c => c.ownerId)));
  const users = await prisma.user.findMany({
    where: { id: { in: ownerIds } }
  });
  
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
    usersMap[u.id] = {
      displayName: u.displayName || u.email?.split("@")[0] || "Alexander Mitchell",
      avatarUrl
    };
  }

  const formattedComments = await Promise.all(comments.map(async (c) => {
    const userMeta = usersMap[c.ownerId] || {
      displayName: "Alexander Mitchell",
      avatarUrl: ""
    };
    
    const timeDiff = Date.now() - new Date(c.createdAt).getTime();
    let timeLabel = "Just now";
    const minutes = Math.floor(timeDiff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) timeLabel = `${days} day${days > 1 ? "s" : ""} ago`;
    else if (hours > 0) timeLabel = `${hours} hour${hours > 1 ? "s" : ""} ago`;
    else if (minutes > 0) timeLabel = `${minutes} minute${minutes > 1 ? "s" : ""} ago`;

    let reactions = { like: 0, love: 0, haha: 0, wow: 0, sad: 0 };
    if (c.reactionsCount) {
      try {
        reactions = typeof c.reactionsCount === "string" ? JSON.parse(c.reactionsCount) : c.reactionsCount;
      } catch (_) {}
    }

    return {
      id: c.id,
      author: userMeta.displayName,
      avatar: userMeta.avatarUrl,
      text: c.text,
      time: timeLabel,
      reactions,
      userReaction: reactionsMap[c.id] || null,
      parentCommentId: c.parentCommentId || null,
      createdAt: c.createdAt
    };
  }));

  const rootComments = [];
  const commentMap = {};

  formattedComments.forEach(c => {
    c.replies = [];
    commentMap[c.id] = c;
  });

  formattedComments.forEach(c => {
    if (c.parentCommentId) {
      // Find top-level root comment if parent is a reply or sub-reply
      let curr = c.parentCommentId;
      let root = null;
      while (curr && commentMap[curr]) {
        root = commentMap[curr];
        curr = commentMap[curr].parentCommentId;
      }
      if (root) {
        root.replies.push(c);
      } else {
        rootComments.push(c);
      }
    } else {
      rootComments.push(c);
    }
  });

  return rootComments;
};

const createComment = async ({ user, memoryId, text, parentCommentId }) => {
  const memory = await prisma.memory.findUnique({
    where: { id: memoryId }
  });
  if (!memory) {
    const error = new Error("Memory not found");
    error.statusCode = 404;
    throw error;
  }

  let validParentId = null;
  if (parentCommentId) {
    const parentComment = await prisma.comment.findUnique({
      where: { id: parentCommentId }
    });
    if (parentComment) {
      validParentId = parentCommentId;
    }
  }

  const comment = await prisma.comment.create({
    data: {
      text,
      memoryId,
      ownerId: user.id,
      parentCommentId: validParentId
    }
  });

  // Increment comments count on Memory
  await prisma.memory.update({
    where: { id: memoryId },
    data: {
      commentsCount: { increment: 1 }
    }
  });

  return comment;
};

const reactToComment = async ({ user, commentId, type }) => {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId }
  });
  if (!comment) {
    const error = new Error("Comment not found");
    error.statusCode = 404;
    throw error;
  }

  const existingReaction = await prisma.commentReaction.findUnique({
    where: {
      commentId_userId: {
        commentId,
        userId: user.id
      }
    }
  });

  let userReaction = type;
  
  let reactions = { like: 0, love: 0, haha: 0, wow: 0, sad: 0 };
  if (comment.reactionsCount) {
    try {
      reactions = typeof comment.reactionsCount === "string" 
        ? JSON.parse(comment.reactionsCount) 
        : comment.reactionsCount;
    } catch (_) {}
  }
  // Safeguard keys
  ["like", "love", "haha", "wow", "sad"].forEach(k => {
    if (reactions[k] === undefined) reactions[k] = 0;
  });

  if (existingReaction) {
    const oldType = existingReaction.type;
    if (oldType === type || !type) {
      // Toggle reaction off
      await prisma.commentReaction.delete({
        where: { id: existingReaction.id }
      });
      
      reactions[oldType] = Math.max(0, (reactions[oldType] || 1) - 1);
      userReaction = null;
    } else {
      // Change reaction type
      await prisma.commentReaction.update({
        where: { id: existingReaction.id },
        data: { type }
      });

      reactions[oldType] = Math.max(0, (reactions[oldType] || 1) - 1);
      reactions[type] = (reactions[type] || 0) + 1;
    }
  } else if (type) {
    // Add new reaction
    await prisma.commentReaction.create({
      data: {
        commentId,
        userId: user.id,
        type
      }
    });

    reactions[type] = (reactions[type] || 0) + 1;
  }

  // Update in database
  const updatedComment = await prisma.comment.update({
    where: { id: commentId },
    data: {
      reactionsCount: reactions
    }
  });

  return {
    reactions: updatedComment.reactionsCount,
    userReaction
  };
};

module.exports = {
  getCommentsForMemory,
  createComment,
  reactToComment
};
