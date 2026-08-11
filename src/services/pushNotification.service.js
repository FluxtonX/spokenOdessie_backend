const admin = require("../config/firebase");
const prisma = require("../config/prisma");

/**
 * Register or update a user's device FCM push token in PostgreSQL
 */
async function registerDeviceToken({ userId, token, deviceType = "web" }) {
  if (!userId || !token) {
    throw new Error("userId and token are required to register device token");
  }

  return prisma.deviceToken.upsert({
    where: { token },
    update: {
      userId,
      deviceType: deviceType || "web",
      updatedAt: new Date(),
    },
    create: {
      userId,
      token,
      deviceType: deviceType || "web",
    },
  });
}

/**
 * Unregister/delete a user's device FCM push token
 */
async function unregisterDeviceToken({ userId, token }) {
  if (!token) return null;

  try {
    return await prisma.deviceToken.deleteMany({
      where: {
        token,
        ...(userId ? { userId } : {}),
      },
    });
  } catch (err) {
    console.warn("Device token unregistration error:", err.message);
    return null;
  }
}

/**
 * Send real-time Web Push notification to all active devices of a user
 */
async function sendWebPushNotification({ userId, title, body, actionUrl, metadata }) {
  if (!userId || !title) return null;

  try {
    // 1. Fetch user device tokens
    const deviceRecords = await prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });

    if (deviceRecords.length === 0) {
      return null;
    }

    const tokens = deviceRecords.map((d) => d.token).filter(Boolean);
    if (tokens.length === 0) return null;

    // Verify Firebase Admin is initialized
    if (!admin.apps || admin.apps.length === 0) {
      console.warn("Firebase Admin not initialized, skipping Web Push notification dispatch.");
      return null;
    }

    const url = actionUrl || "/memories";

    // 2. Multicast batch send (up to 500 per batch)
    const chunkSize = 500;
    const deadTokens = [];

    for (let i = 0; i < tokens.length; i += chunkSize) {
      const batchTokens = tokens.slice(i, i + chunkSize);

      const payload = {
        notification: {
          title: String(title),
          body: String(body || ""),
        },
        data: {
          url: String(url),
          metadata: JSON.stringify(metadata || {}),
        },
        tokens: batchTokens,
      };

      try {
        const response = await admin.messaging().sendEachForMulticast(payload);

        // Identify invalid/dead registration tokens for auto-cleanup
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errCode = resp.error?.code;
            if (
              errCode === "messaging/invalid-registration-token" ||
              errCode === "messaging/registration-token-not-registered"
            ) {
              deadTokens.push(batchTokens[idx]);
            }
          }
        });
      } catch (batchErr) {
        console.warn("FCM multicast dispatch warning:", batchErr.message);
      }
    }

    // 3. Auto-clean dead tokens from database
    if (deadTokens.length > 0) {
      prisma.deviceToken
        .deleteMany({
          where: { token: { in: deadTokens } },
        })
        .catch((e) => console.warn("Failed to cleanup dead device tokens:", e.message));
    }

    return true;
  } catch (error) {
    console.error("sendWebPushNotification error:", error.message);
    return null;
  }
}

module.exports = {
  registerDeviceToken,
  unregisterDeviceToken,
  sendWebPushNotification,
};
