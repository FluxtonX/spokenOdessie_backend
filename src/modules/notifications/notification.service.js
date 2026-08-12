const prisma = require("../../config/prisma");
const { sendNotificationToUser } = require("../../socket");
const { shouldCreateNotification, getUserNotificationPreferences } = require("../../services/notificationPreferences.service");
const { sendWebPushNotification } = require("../../services/pushNotification.service");

/**
 * Create a notification for a user
 */
async function createNotification({ userId, type, title, message, metadata, actionUrl }) {
  try {
    const allowed = await shouldCreateNotification(userId, type, metadata);
    if (!allowed) {
      console.log(`Notification creation suppressed for user ${userId} due to preference settings: ${type}`);
      return null;
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        metadata: metadata || {},
        actionUrl,
      }
    });

    // Instantly push over WebSocket to recipient's connected sockets
    try {
      sendNotificationToUser(userId, notification);
    } catch (wsErr) {
      console.warn("Could not push socket notification:", wsErr.message);
    }

    // Asynchronously dispatch real-time Web Push notification to user devices
    try {
      sendWebPushNotification({
        userId,
        title,
        body: message,
        actionUrl,
        metadata,
      }).catch((pErr) => console.warn("Background Web Push dispatch warning:", pErr.message));
    } catch (_) {}

    return notification;
  } catch (error) {
    console.error("Failed to create notification:", error);
    throw error;
  }
}

/**
 * Get all notifications for a user
 */
async function getUserNotifications({ userId, unreadOnly = false, limit = 50 }) {
  try {
    const prefs = await getUserNotificationPreferences(userId);

    const where = {
      userId,
      ...(unreadOnly ? { isRead: false } : {})
    };

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    });

    // Filter out notifications according to user's current active preference toggles
    return notifications.filter((n) => {
      const type = String(n.type || "").toUpperCase();
      const meta = n.metadata || {};

      if (type === "FOLLOW" && prefs.followerActivity === false) return false;
      if ((type.startsWith("FAMILY") || meta.isFamilyActivity || meta.familyCircleId) && prefs.familyActivity === false) return false;
      if ((type.startsWith("MEMORY") || type.startsWith("COMMENT") || type.includes("REACTION") || type.includes("LIKE")) && prefs.memoryInteractions === false) return false;
      if (type.startsWith("SECURITY") && prefs.securityAlerts === false) return false;
      return true;
    });
  } catch (error) {
    console.error("Failed to get user notifications:", error);
    throw error;
  }
}

/**
 * Mark notification as read
 */
async function markNotificationAsRead({ notificationId, userId }) {
  try {
    const notification = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId
      },
      data: {
        isRead: true
      }
    });
    return notification;
  } catch (error) {
    console.error("Failed to mark notification as read:", error);
    throw error;
  }
}

/**
 * Mark all notifications as read for a user
 */
async function markAllAsRead({ userId }) {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false
      },
      data: {
        isRead: true
      }
    });
    return result;
  } catch (error) {
    console.error("Failed to mark all notifications as read:", error);
    throw error;
  }
}

/**
 * Delete a notification
 */
async function deleteNotification({ notificationId, userId }) {
  try {
    const notification = await prisma.notification.deleteMany({
      where: {
        id: notificationId,
        userId
      }
    });
    return notification;
  } catch (error) {
    console.error("Failed to delete notification:", error);
    throw error;
  }
}

/**
 * Get unread notification count for a user
 */
async function getUnreadCount({ userId }) {
  try {
    const count = await prisma.notification.count({
      where: {
        userId,
        isRead: false
      }
    });
    return count;
  } catch (error) {
    console.error("Failed to get unread notification count:", error);
    throw error;
  }
}

/**
 * Get all mutual friend, follower, and family connection user IDs for a user
 */
async function getConnectedUserIds(userId) {
  if (!userId) return [];
  try {
    // 1. Family connections
    const familyConnections = await prisma.familyConnection.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }]
      },
      select: { user1Id: true, user2Id: true }
    });
    const familyIds = familyConnections.map(c => c.user1Id === userId ? c.user2Id : c.user1Id);

    // 2. Family circle members
    const familyMemberships = await prisma.familyMember.findMany({
      where: { userId },
      select: { familyCircleId: true }
    });
    const circleIds = familyMemberships.map(m => m.familyCircleId);
    let circleMemberIds = [];
    if (circleIds.length > 0) {
      const circleMembers = await prisma.familyMember.findMany({
        where: { familyCircleId: { in: circleIds } },
        select: { userId: true }
      });
      circleMemberIds = circleMembers.map(m => m.userId);
    }

    // 3. Following and Followers
    const myFollowings = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true }
    });
    const followingIds = myFollowings.map(f => f.followingId);

    const myFollowers = await prisma.follow.findMany({
      where: { followingId: userId },
      select: { followerId: true }
    });
    const followerIds = myFollowers.map(f => f.followerId);

    const all = new Set([
      ...familyIds,
      ...circleMemberIds,
      ...followingIds,
      ...followerIds
    ]);
    all.delete(userId);

    return Array.from(all).filter(Boolean);
  } catch (err) {
    console.warn("Failed to get connected user IDs:", err.message);
    return [];
  }
}

module.exports = {
  createNotification,
  getUserNotifications,
  markNotificationAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
  getConnectedUserIds
};
