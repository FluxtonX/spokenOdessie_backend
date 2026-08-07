const prisma = require("../config/prisma");
const { parseUserAgent } = require("../utils/useragent.util");
const { sendNewLoginNotificationEmail } = require("./email.service");
const { logSecurityEvent } = require("./audit.service");

/**
 * Register a new active session upon sign-in.
 * Detects if signing in from a new device/browser and sends Brevo email alert if enabled.
 */
async function registerUserSession({ userId, sessionJti, req }) {
  if (!sessionJti) return null;

  const rawUa = req?.headers?.["user-agent"] || "";
  const rawIp = req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || req?.ip || req?.socket?.remoteAddress || "127.0.0.1";
  const cleanIp = rawIp.replace(/^::ffff:/, "");
  const ipAddress = (cleanIp === "::1" || cleanIp === "127.0.0.1") ? "127.0.0.1 (Localhost)" : cleanIp;
  const parsed = parseUserAgent(rawUa);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, loginNotifications: true },
  });

  if (!user) return null;

  // Check if user has logged in from this device name before
  const existingDeviceSession = await prisma.userSession.findFirst({
    where: {
      userId,
      deviceName: parsed.deviceName,
    },
  });

  const isNewDevice = !existingDeviceSession;

  // Create new active session record in database
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  const newSession = await prisma.userSession.create({
    data: {
      userId,
      sessionToken: sessionJti,
      deviceName: parsed.deviceName,
      deviceType: parsed.deviceType,
      ipAddress,
      userAgent: rawUa,
      expiresAt,
    },
  });

  // If new device & user enabled login notifications, send Brevo email alert and create in-app notification
  if (isNewDevice) {
    if (user.loginNotifications !== false) {
      const formattedTime = new Date().toLocaleString("en-US", {
        dateStyle: "full",
        timeStyle: "medium",
      });

      // Send email asynchronously (non-blocking)
      sendNewLoginNotificationEmail(user.email, {
        deviceName: parsed.deviceName,
        ipAddress,
        time: formattedTime,
      }).catch((err) => console.error("Error sending new device email:", err));

      logSecurityEvent({
        userId,
        action: "NEW_DEVICE_SIGNIN",
        req,
        metadata: { deviceName: parsed.deviceName, ipAddress },
      }).catch(() => {});
    }

    // Create in-app Notification record
    prisma.notification
      .create({
        data: {
          userId,
          type: "SECURITY_NEW_DEVICE",
          title: "New Device Sign-In Detected",
          message: `Signed in from ${parsed.deviceName} (IP: ${ipAddress}). If this was not you, review your Security Settings immediately.`,
          actionUrl: "/settings/security",
          metadata: { deviceName: parsed.deviceName, ipAddress },
        },
      })
      .catch((err) => console.warn("Failed to create in-app new device notification:", err.message));
  }

  return newSession;
}

/**
 * Get all active sessions for a user.
 */
async function getUserSessions(userId, currentSessionToken, req = null) {
  let sessions = await prisma.userSession.findMany({
    where: {
      userId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastActive: "desc" },
  });

  if (sessions.length === 0 && currentSessionToken) {
    const newSess = await registerUserSession({ userId, sessionJti: currentSessionToken, req });
    if (newSess) {
      sessions = [newSess];
    }
  }

  const hasCurrentMatch = sessions.some((s) => currentSessionToken && s.sessionToken === currentSessionToken);

  return sessions.map((s, index) => ({
    id: s.id,
    deviceName: s.deviceName,
    deviceType: s.deviceType,
    ipAddress: s.ipAddress,
    lastActive: s.lastActive,
    createdAt: s.createdAt,
    isCurrent: Boolean(
      (currentSessionToken && s.sessionToken === currentSessionToken) ||
      (!hasCurrentMatch && index === 0)
    ),
  }));
}

/**
 * Revoke a single active session by ID.
 */
async function revokeSession(userId, sessionId) {
  const session = await prisma.userSession.findFirst({
    where: { id: sessionId, userId },
  });

  if (!session) {
    throw new Error("Session not found or already revoked.");
  }

  await prisma.userSession.delete({
    where: { id: sessionId },
  });

  return true;
}

/**
 * Revoke all other active sessions for a user except the current one.
 */
async function revokeOtherSessions(userId, currentSessionToken) {
  await prisma.userSession.deleteMany({
    where: {
      userId,
      sessionToken: { not: currentSessionToken },
    },
  });

  return true;
}

/**
 * Validate that a session token still exists in database and is active.
 * Throttles updating lastActive timestamp.
 */
async function validateSession(sessionToken) {
  if (!sessionToken) return true; // Fallback for legacy tokens

  const session = await prisma.userSession.findUnique({
    where: { sessionToken },
  });

  if (!session) return false;

  // Touch lastActive timestamp if older than 5 minutes
  if (Date.now() - new Date(session.lastActive).getTime() > 5 * 60 * 1000) {
    prisma.userSession
      .update({
        where: { id: session.id },
        data: { lastActive: new Date() },
      })
      .catch(() => {});
  }

  return true;
}

module.exports = {
  registerUserSession,
  getUserSessions,
  revokeSession,
  revokeOtherSessions,
  validateSession,
};
