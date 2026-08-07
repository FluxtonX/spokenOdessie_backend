const prisma = require("../config/prisma");

/**
 * Log a security audit event to the database.
 * Does NOT throw errors to ensure main auth flows are not disrupted.
 * Sensitive parameters are stripped.
 */
async function logSecurityEvent({ userId = null, action, req = null, metadata = null }) {
  try {
    const ipAddress = req ? (req.headers["x-forwarded-for"] || req.ip || req.connection?.remoteAddress || null) : null;
    const userAgent = req ? (req.headers["user-agent"] || null) : null;

    // Clean metadata to strip sensitive fields if any
    let safeMetadata = metadata;
    if (metadata && typeof metadata === "object") {
      safeMetadata = { ...metadata };
      delete safeMetadata.password;
      delete safeMetadata.secret;
      delete safeMetadata.totpCode;
      delete safeMetadata.code;
      delete safeMetadata.recoveryCode;
      delete safeMetadata.token;
    }

    await prisma.securityAuditLog.create({
      data: {
        userId,
        action,
        ipAddress: ipAddress ? String(ipAddress).slice(0, 100) : null,
        userAgent: userAgent ? String(userAgent).slice(0, 300) : null,
        metadata: safeMetadata || undefined,
      },
    });
  } catch (err) {
    console.error("⚠️ Security Audit Log Error:", err.message);
  }
}

module.exports = {
  logSecurityEvent,
};
