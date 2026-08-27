const prisma = require("../../config/prisma");

/**
 * Resolve Authorized Memory IDs for a User (Strict RAG Security Barrier)
 */
const getAuthorizedMemoryIdsForUser = async (currentUser) => {
  if (!currentUser) return [];

  const currentUserId = currentUser.id || currentUser.uid || currentUser.sub;
  const userEmail = currentUser.email || "";
  const googleId = currentUser.googleId || "";
  const userTokens = [currentUserId, userEmail, googleId].filter(Boolean);

  // 1. Resolve User's Active Family Circle IDs
  const memberships = await prisma.familyMember.findMany({
    where: {
      userId: currentUserId,
      status: "ACTIVE"
    },
    select: { familyCircleId: true }
  });
  const activeCircleIds = memberships.map(m => m.familyCircleId);

  // 2. Fetch Memories matching ownership, public, family, or tagged criteria
  const candidateMemories = await prisma.memory.findMany({
    where: {
      status: "published",
      OR: [
        { ownerId: { in: userTokens } },
        { privacy: "Public" },
        {
          privacy: "Family",
          familyLinks: {
            some: {
              familyCircleId: { in: activeCircleIds }
            }
          }
        },
        {
          taggedUserIds: {
            hasSome: userTokens
          }
        }
      ]
    },
    select: {
      id: true,
      ownerId: true,
      isVaultLocked: true,
      unlockAt: true
    }
  });

  const now = new Date();
  const authorizedIds = [];

  for (const mem of candidateMemories) {
    const isOwner = userTokens.includes(mem.ownerId);

    // Time Capsule Lock Enforcement:
    if (mem.isVaultLocked && mem.unlockAt && new Date(mem.unlockAt) > now) {
      if (!isOwner) {
        const legacySettings = await prisma.legacySettings.findUnique({
          where: { userId: mem.ownerId }
        }).catch(() => null);

        if (!legacySettings || !legacySettings.isReleased) {
          continue; // Exclude locked Time Capsule
        }
      }
    }

    authorizedIds.push(mem.id);
  }

  return authorizedIds;
};

/**
 * Resolve Complete Authorized Scope (User IDs, Family Circle IDs, and Memory IDs)
 */
const getAuthorizedScopeForUser = async (currentUser) => {
  if (!currentUser) {
    return { allowedMemoryIds: [], allowedUserIds: [], activeCircleIds: [] };
  }

  const currentUserId = currentUser.id || currentUser.uid || currentUser.sub;
  const userEmail = currentUser.email || "";
  const googleId = currentUser.googleId || "";
  const userTokens = [currentUserId, userEmail, googleId].filter(Boolean);

  // 1. Resolve User's Active Family Circle Memberships & Circle IDs
  const memberships = await prisma.familyMember.findMany({
    where: {
      userId: currentUserId,
      status: "ACTIVE"
    },
    select: { familyCircleId: true }
  });
  const activeCircleIds = memberships.map(m => m.familyCircleId);

  // 2. Resolve Authorized User IDs (All members belonging to the user's family circles)
  let allowedUserIds = [...userTokens];
  if (activeCircleIds.length > 0) {
    const circleMembers = await prisma.familyMember.findMany({
      where: {
        familyCircleId: { in: activeCircleIds },
        status: "ACTIVE"
      },
      select: { userId: true }
    });
    const familyUserIds = circleMembers.map(m => m.userId);
    allowedUserIds = Array.from(new Set([...userTokens, ...familyUserIds]));
  }

  // 3. Resolve Authorized Memory IDs
  const allowedMemoryIds = await getAuthorizedMemoryIdsForUser(currentUser);

  return {
    allowedMemoryIds,
    allowedUserIds,
    activeCircleIds
  };
};

module.exports = {
  getAuthorizedMemoryIdsForUser,
  getAuthorizedScopeForUser
};
