const prisma = require("../config/prisma");

const RESTRICTION_STATUSES = new Set([
  "NONE",
  "POSTING_RESTRICTED",
  "TEMPORARY_SUSPENDED",
  "PERMANENTLY_SUSPENDED",
]);

function getEffectiveRestriction(user, now = new Date()) {
  if (user?.adminRestriction === "TEMPORARY_SUSPENDED" && user.adminRestrictionEndsAt) {
    return new Date(user.adminRestrictionEndsAt) <= now ? "NONE" : "TEMPORARY_SUSPENDED";
  }
  if (user?.adminRestriction && user.adminRestriction !== "NONE") return user.adminRestriction;
  return user?.isActive === false ? "PERMANENTLY_SUSPENDED" : "NONE";
}

async function refreshExpiredRestriction(user) {
  if (getEffectiveRestriction(user) !== "NONE" || user?.adminRestriction !== "TEMPORARY_SUSPENDED") return user;
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({
      where: { id: user.id, adminRestriction: "TEMPORARY_SUSPENDED", adminRestrictionEndsAt: { lte: now } },
      data: { isActive: true, adminRestriction: "NONE", adminRestrictionReason: null, adminRestrictionEndsAt: null, adminRestrictionUpdatedAt: now },
    });
    if (!result.count) {
      const current = await tx.user.findUnique({ where: { id: user.id } });
      return current ? { ...user, ...current } : user;
    }
    await tx.securityAuditLog.create({
      data: {
        action: "ADMIN_TEMPORARY_SUSPENSION_EXPIRED",
        metadata: { adminEmail: "System", targetUserId: user.id, targetEmail: user.email, reason: "The temporary suspension period ended." },
      },
    });
    await tx.notification.create({ data: {
      userId: user.id, type: "ADMIN_ACCOUNT_RESTRICTION", title: "Temporary suspension ended",
      message: "Your temporary account suspension has ended. You can sign in again.",
      actionUrl: "/notifications", metadata: { restrictionStatus: "NONE", automatic: true },
    } });
    const current = await tx.user.findUnique({ where: { id: user.id } });
    return current ? { ...user, ...current } : user;
  });
}

module.exports = { RESTRICTION_STATUSES, getEffectiveRestriction, refreshExpiredRestriction };
