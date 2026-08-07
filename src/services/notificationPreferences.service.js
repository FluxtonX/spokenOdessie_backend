const prisma = require("../config/prisma");

const DEFAULT_PREFERENCES = {
  followerActivity: true,
  familyActivity: true,
  memoryInteractions: true,
  securityAlerts: true,
  loginNotifications: true,
  dailyPrompt: true,
  legacyAlerts: true,
  aiInsights: true,
  forgottenMemories: true,
};

/**
 * Get notification preferences for a user.
 */
async function getUserNotificationPreferences(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPreferences: true, loginNotifications: true },
  });

  if (!user) return DEFAULT_PREFERENCES;

  let prefs = user.notificationPreferences;
  if (!prefs || typeof prefs !== "object") {
    prefs = {};
  }

  return {
    ...DEFAULT_PREFERENCES,
    ...prefs,
    loginNotifications: user.loginNotifications !== false,
  };
}

/**
 * Update notification preferences for a user.
 */
async function updateUserNotificationPreferences(userId, updates) {
  const current = await getUserNotificationPreferences(userId);
  const updatedPrefs = {
    ...current,
    ...updates,
  };

  const userUpdates = {
    notificationPreferences: updatedPrefs,
  };

  if (typeof updates.loginNotifications === "boolean") {
    userUpdates.loginNotifications = updates.loginNotifications;
  }

  await prisma.user.update({
    where: { id: userId },
    data: userUpdates,
  });

  return updatedPrefs;
}

/**
 * Guard function to check if a specific notification type should be generated for a user.
 */
async function shouldCreateNotification(userId, notificationType, metadata = {}) {
  const prefs = await getUserNotificationPreferences(userId);
  const type = String(notificationType || "").toUpperCase();

  if (type === "FOLLOW") {
    return prefs.followerActivity !== false;
  }

  if (type.startsWith("FAMILY") || metadata?.isFamilyActivity || metadata?.familyCircleId) {
    return prefs.familyActivity !== false;
  }

  if (type.startsWith("MEMORY") || type.startsWith("COMMENT") || type.includes("REACTION") || type.includes("LIKE")) {
    return prefs.memoryInteractions !== false;
  }

  if (type.startsWith("SECURITY")) {
    return prefs.securityAlerts !== false;
  }

  return true;
}

module.exports = {
  DEFAULT_PREFERENCES,
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  shouldCreateNotification,
};
