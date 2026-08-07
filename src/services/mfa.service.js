const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

const JWT_SECRET = process.env.JWT_SECRET || "spoken_odyssey_super_secret_key_12345";
const MFA_PENDING_EXPIRES_IN = "5m"; // Restrictive 5 minute window

/**
 * Generate a short-lived restricted token for MFA verification.
 * Standard API middleware (`protect`) will reject this token.
 */
function generateMfaPendingToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role || "USER",
      mfaPending: true,
      type: "MFA_PENDING",
    },
    JWT_SECRET,
    { expiresIn: MFA_PENDING_EXPIRES_IN }
  );
}

/**
 * Verify an MFA Pending token provided during MFA verification endpoints.
 */
function verifyMfaPendingToken(token) {
  if (!token) {
    throw new Error("MFA pending token is required");
  }

  const decoded = jwt.verify(token, JWT_SECRET);
  if (!decoded || !decoded.mfaPending || decoded.type !== "MFA_PENDING") {
    throw new Error("Invalid or expired MFA pending token");
  }

  return decoded;
}

/**
 * Determine available MFA methods for a user.
 */
async function getUserMfaState(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      mfaEnabled: true,
      mfaTypes: true,
      passwordChangedAt: true,
      loginNotifications: true,
      totpSecret: { select: { verified: true } },
      passkeys: { select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true } },
      _count: {
        select: {
          recoveryCodes: {
            where: { usedAt: null }
          }
        }
      }
    }
  });

  if (!user) return null;

  const availableMethods = [];
  if (user.totpSecret && user.totpSecret.verified) {
    availableMethods.push("totp");
  }
  if (user.passkeys && user.passkeys.length > 0) {
    availableMethods.push("passkey");
  }
  if (user._count.recoveryCodes > 0) {
    availableMethods.push("recovery_code");
  }

  return {
    mfaEnabled: user.mfaEnabled && availableMethods.length > 0,
    availableMethods,
    totpEnabled: !!(user.totpSecret && user.totpSecret.verified),
    passkeyCount: user.passkeys.length,
    remainingRecoveryCodes: user._count.recoveryCodes,
    passkeys: user.passkeys,
    passwordChangedAt: user.passwordChangedAt,
    loginNotifications: user.loginNotifications !== false,
  };
}

module.exports = {
  generateMfaPendingToken,
  verifyMfaPendingToken,
  getUserMfaState,
};
