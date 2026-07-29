const prisma = require("../../config/prisma");

/**
 * Create a notification for a user
 */
async function createNotification({ userId, type, title, message, metadata, actionUrl }) {
  try {
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

    return notifications;
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

module.exports = {
  createNotification,
  getUserNotifications,
  markNotificationAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount
};
