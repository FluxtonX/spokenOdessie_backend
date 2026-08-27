const prisma = require("../../config/prisma");
const { createNotification } = require("../notifications/notification.service");
const { serializeUser } = require("../../utils/serializer");

/**
 * Get or create legacy settings for current user
 */
const getOrCreateLegacySettings = async ({ currentUser }) => {
  let settings = await prisma.legacySettings.findUnique({
    where: { userId: currentUser.id },
    include: {
      releaseRequests: {
        include: { requester: true },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!settings) {
    settings = await prisma.legacySettings.create({
      data: {
        userId: currentUser.id,
        administratorName: "Sarah Murphy",
        releaseCondition: "After verified passing",
        familyCircleAccess: "Full archive",
        publicProfile: "Remain public"
      },
      include: {
        releaseRequests: {
          include: { requester: true },
          orderBy: { createdAt: "desc" }
        }
      }
    });
  }

  return settings;
};

/**
 * Update legacy settings for current user
 */
const updateLegacySettings = async ({ currentUser, data = {}, updateData }) => {
  const existing = await getOrCreateLegacySettings({ currentUser });
  const rawData = updateData || data;

  const updatePayload = {};
  if (rawData.administrator !== undefined) updatePayload.administratorName = String(rawData.administrator);
  if (rawData.administratorId !== undefined) {
    const adminUserId = String(rawData.administratorId);
    if (adminUserId && adminUserId !== currentUser.id) {
      // Validate that administrator is in user's Family Circle or Family Connections
      const myMemberships = await prisma.familyMember.findMany({
        where: { userId: currentUser.id },
        select: { familyCircleId: true }
      });
      const myCircleIds = myMemberships.map(m => m.familyCircleId);

      let isAllowed = false;
      if (myCircleIds.length > 0) {
        const adminMembership = await prisma.familyMember.findFirst({
          where: {
            familyCircleId: { in: myCircleIds },
            userId: adminUserId
          }
        });
        if (adminMembership) isAllowed = true;
      }

      if (!isAllowed) {
        const connection = await prisma.familyConnection.findFirst({
          where: {
            OR: [
              { user1Id: currentUser.id, user2Id: adminUserId },
              { user1Id: adminUserId, user2Id: currentUser.id }
            ]
          }
        });
        if (connection) isAllowed = true;
      }

      if (!isAllowed) {
        const error = new Error("Invalid Administrator: Selected user is not a member of your family circle");
        error.statusCode = 400;
        throw error;
      }
    }
    updatePayload.administratorId = adminUserId;
  }
  if (rawData.releaseCondition !== undefined) updatePayload.releaseCondition = String(rawData.releaseCondition);
  if (rawData.familyCircleAccess !== undefined) updatePayload.familyCircleAccess = String(rawData.familyCircleAccess);
  if (rawData.publicProfile !== undefined) updatePayload.publicProfile = String(rawData.publicProfile);

  const updated = await prisma.legacySettings.update({
    where: { id: existing.id },
    data: updatePayload,
    include: {
      releaseRequests: {
        include: { requester: true },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  // Notify assigned administrator (Phase 15)
  if (updatePayload.administratorId && updatePayload.administratorId !== existing.administratorId) {
    try {
      const { createNotification } = require("../notifications/notification.service");
      await createNotification({
        userId: updatePayload.administratorId,
        type: "LEGACY_ADMIN_ASSIGNED",
        title: "Assigned as Trusted Administrator",
        message: `${currentUser.displayName || currentUser.name || "A family member"} designated you as their Trusted Administrator for digital legacy release.`,
        actionUrl: "/family"
      });
    } catch (_) {}
  }

  return updated;
};

/**
 * Request Legacy Vault Release (by assigned Trusted Administrator or Family Admin)
 */
const requestVaultRelease = async ({ currentUser, legacyUserId, reason }) => {
  const targetId = legacyUserId || currentUser.id;

  let settings = await prisma.legacySettings.findUnique({
    where: { userId: targetId }
  });

  if (!settings) {
    settings = await getOrCreateLegacySettings({ currentUser: { id: targetId } });
  }

  if (settings.isReleased) {
    const error = new Error("Vault is already released");
    error.statusCode = 400;
    throw error;
  }

  const existingPending = await prisma.vaultReleaseRequest.findFirst({
    where: {
      legacySettingsId: settings.id,
      status: "PENDING"
    }
  });

  if (existingPending) {
    return existingPending;
  }

  const releaseRequest = await prisma.vaultReleaseRequest.create({
    data: {
      legacySettingsId: settings.id,
      requesterId: currentUser.id,
      reason: reason || "Release criteria met per legacy access terms",
      status: "PENDING"
    },
    include: {
      requester: true,
      legacySettings: true
    }
  });

  // Notify user & family admins
  await createNotification({
    userId: targetId,
    type: "VAULT_RELEASE_REQUESTED",
    title: "Legacy Vault Release Requested",
    message: `${currentUser.displayName || currentUser.name || "Administrator"} has submitted a request to release your Family Legacy Vault.`,
    actionUrl: "/family"
  }).catch(() => {});

  const serializedRequester = await serializeUser(releaseRequest.requester);
  return { ...releaseRequest, requester: serializedRequester };
};

/**
 * Verify / Approve Vault Release (by Circle Admin or Trusted Admin)
 */
const approveVaultRelease = async ({ currentUser, requestId }) => {
  const request = await prisma.vaultReleaseRequest.findUnique({
    where: { id: requestId },
    include: { legacySettings: true }
  });

  if (!request) {
    const error = new Error("Vault release request not found");
    error.statusCode = 404;
    throw error;
  }

  if (request.status !== "PENDING") {
    const error = new Error("Request is not pending approval");
    error.statusCode = 400;
    throw error;
  }

  // Update request status
  await prisma.vaultReleaseRequest.update({
    where: { id: requestId },
    data: {
      status: "APPROVED",
      verifiedBy: currentUser.id
    }
  });

  // Update legacy settings isReleased = true
  const updatedSettings = await prisma.legacySettings.update({
    where: { id: request.legacySettingsId },
    data: {
      isReleased: true,
      releasedAt: new Date(),
      releasedBy: currentUser.id
    }
  });

  // Unlock all vault memories for this legacy user
  await prisma.memory.updateMany({
    where: {
      ownerId: updatedSettings.userId,
      isVaultLocked: true
    },
    data: {
      isVaultLocked: false,
      privacy: "Family"
    }
  });

  // Dispatch real-time notification to vault owner (Phase 15)
  try {
    const { createNotification } = require("../notifications/notification.service");
    await createNotification({
      userId: updatedSettings.userId,
      type: "VAULT_UNLOCKED",
      title: "Digital Legacy Vault Released",
      message: `Your digital legacy vault archive has been verified and unlocked by ${currentUser.displayName || currentUser.name || "Administrator"}.`,
      actionUrl: "/family"
    });
  } catch (_) {}

  return updatedSettings;
};

/**
 * Reject Vault Release Request
 */
const rejectVaultRelease = async ({ currentUser, requestId, reason }) => {
  const request = await prisma.vaultReleaseRequest.findUnique({
    where: { id: requestId }
  });

  if (!request) {
    const error = new Error("Vault release request not found");
    error.statusCode = 404;
    throw error;
  }

  const updated = await prisma.vaultReleaseRequest.update({
    where: { id: requestId },
    data: {
      status: "REJECTED",
      verifiedBy: currentUser.id
    }
  });

  // Dispatch notification to requester (Phase 15)
  try {
    const { createNotification } = require("../notifications/notification.service");
    await createNotification({
      userId: request.requesterId,
      type: "VAULT_RELEASE_REJECTED",
      title: "Vault Release Request Declined",
      message: `Your request to release the family legacy vault archive was declined by ${currentUser.displayName || currentUser.name || "Administrator"}.`,
      actionUrl: "/family"
    });
  } catch (_) {}

  return updated;
};

/**
 * Get Vault & Time-Capsule Memories for user/family
 */
const getVaultMemories = async ({ currentUser, targetUserId }) => {
  let targetOwnerIds = targetUserId ? [targetUserId] : [currentUser.id];

  if (!targetUserId) {
    try {
      const myMemberships = await prisma.familyMember.findMany({
        where: { userId: currentUser.id },
        select: { familyCircleId: true }
      });
      const myCircleIds = myMemberships.map(m => m.familyCircleId);

      if (myCircleIds.length > 0) {
        const circleMembers = await prisma.familyMember.findMany({
          where: { familyCircleId: { in: myCircleIds } },
          select: { userId: true }
        });
        targetOwnerIds.push(...circleMembers.map(m => m.userId));
      }

      const connections = await prisma.familyConnection.findMany({
        where: {
          OR: [
            { user1Id: currentUser.id },
            { user2Id: currentUser.id }
          ]
        }
      });
      connections.forEach(c => {
        targetOwnerIds.push(c.user1Id === currentUser.id ? c.user2Id : c.user1Id);
      });
    } catch (_) {}
  }

  const uniqueOwnerIds = Array.from(new Set(targetOwnerIds));

  // Resolve all possible user identity tokens (UUID, googleId, email) for reliable querying
  let allPossibleOwnerIds = [...uniqueOwnerIds];
  try {
    const targetUsers = await prisma.user.findMany({
      where: {
        OR: [
          { id: { in: uniqueOwnerIds } },
          { googleId: { in: uniqueOwnerIds } },
          { email: { in: uniqueOwnerIds } }
        ]
      }
    });

    allPossibleOwnerIds = Array.from(new Set([
      ...uniqueOwnerIds,
      ...targetUsers.map(u => u.id),
      ...targetUsers.map(u => u.googleId),
      ...targetUsers.map(u => u.email)
    ])).filter(Boolean);
  } catch (_) {}

  const whereClause = {
    ownerId: { in: allPossibleOwnerIds },
    OR: [
      { isVaultLocked: true },
      { unlockAt: { not: null } }
    ]
  };

  const memories = await prisma.memory.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    include: {
      owner: true
    }
  });

  const now = new Date();
  return Promise.all(
    memories.map(async (m) => {
      const owner = await serializeUser(m.owner);
      const isOwner = currentUser.id === m.ownerId;
      
      let isReleased = false;
      if (m.ownerId) {
        const settings = await prisma.legacySettings.findUnique({
          where: { userId: m.ownerId }
        });
        isReleased = Boolean(settings?.isReleased);
      }

      const isLocked = Boolean(m.isVaultLocked) && (!m.unlockAt || new Date(m.unlockAt) > now) && !isOwner && !isReleased;

      return {
        id: m.id,
        title: isLocked ? "🔒 Sealed Time-Capsule" : m.title,
        description: isLocked ? `🔒 [Sealed in Vault until ${m.unlockAt ? new Date(m.unlockAt).toLocaleDateString() : "release"}]` : (m.description || ""),
        isVaultLocked: Boolean(m.isVaultLocked),
        isLocked,
        unlockAt: m.unlockAt,
        privacy: m.privacy,
        type: m.type,
        owner,
        mediaList: isLocked ? [] : (m.mediaList || []),
        createdAt: m.createdAt
      };
    })
  );
};

/**
 * Get all Family Circle Vaults & Pending Release Requests across connected members
 */
const getFamilyCircleVaults = async ({ currentUser, familyCircleId }) => {
  const myMemberships = await prisma.familyMember.findMany({
    where: { userId: currentUser.id },
    select: { familyCircleId: true }
  });
  const myCircleIds = myMemberships.map(m => m.familyCircleId);
  if (familyCircleId) myCircleIds.push(familyCircleId);

  let targetUserIds = [currentUser.id];

  if (myCircleIds.length > 0) {
    const circleMembers = await prisma.familyMember.findMany({
      where: { familyCircleId: { in: myCircleIds } },
      select: { userId: true }
    });
    targetUserIds.push(...circleMembers.map(m => m.userId));
  }

  // Also include connected family users via familyConnection
  try {
    const connections = await prisma.familyConnection.findMany({
      where: {
        OR: [
          { user1Id: currentUser.id },
          { user2Id: currentUser.id }
        ]
      }
    });
    connections.forEach(c => {
      targetUserIds.push(c.user1Id === currentUser.id ? c.user2Id : c.user1Id);
    });
  } catch (_) {}

  const uniqueUserIds = Array.from(new Set(targetUserIds));

  const usersWithSettings = await prisma.user.findMany({
    where: { id: { in: uniqueUserIds } },
    include: {
      legacySettings: {
        include: {
          releaseRequests: {
            include: { requester: true },
            orderBy: { createdAt: "desc" }
          }
        }
      }
    }
  });

  return Promise.all(
    usersWithSettings.map(async (userDoc) => {
      const serializedUser = await serializeUser(userDoc);
      const settings = userDoc.legacySettings || {
        administratorName: "Unassigned",
        releaseCondition: "After verified passing",
        isReleased: false,
        releaseRequests: []
      };

      const isAssignedAdmin = settings.administratorId === currentUser.id;
      const releaseRequests = (settings.releaseRequests || []).map(r => ({
        ...r,
        requester: r.requester ? { id: r.requester.id, name: r.requester.displayName || r.requester.name } : null
      }));

      return {
        memberUser: serializedUser,
        role: "MEMBER",
        legacySettings: {
          id: settings.id,
          administratorName: settings.administratorName,
          administratorId: settings.administratorId,
          releaseCondition: settings.releaseCondition,
          familyCircleAccess: settings.familyCircleAccess,
          isReleased: settings.isReleased,
          releasedAt: settings.releasedAt,
          releaseRequests
        },
        isAssignedAdmin
      };
    })
  );
};

/**
 * Get all pending vault requests across Family Circle members for Admins
 */
const getPendingVaultRequestsForAdmin = async ({ currentUser, familyCircleId }) => {
  // Find caller's family circles
  const myMemberships = await prisma.familyMember.findMany({
    where: { userId: currentUser.id },
    select: { familyCircleId: true }
  });
  const myCircleIds = myMemberships.map(m => m.familyCircleId);
  if (familyCircleId) myCircleIds.push(familyCircleId);

  const memberUserIds = [currentUser.id];

  if (myCircleIds.length > 0) {
    const circleMembers = await prisma.familyMember.findMany({
      where: { familyCircleId: { in: myCircleIds } },
      select: { userId: true }
    });
    memberUserIds.push(...circleMembers.map(m => m.userId));
  }

  // Also include connected family users via familyConnection
  try {
    const connections = await prisma.familyConnection.findMany({
      where: {
        OR: [
          { user1Id: currentUser.id },
          { user2Id: currentUser.id }
        ]
      }
    });
    connections.forEach(c => {
      memberUserIds.push(c.user1Id === currentUser.id ? c.user2Id : c.user1Id);
    });
  } catch (_) {}

  const uniqueMemberUserIds = Array.from(new Set(memberUserIds));

  const pendingRequests = await prisma.vaultReleaseRequest.findMany({
    where: {
      status: "PENDING",
      OR: [
        { legacySettings: { userId: { in: uniqueMemberUserIds } } },
        { legacySettings: { administratorId: currentUser.id } },
        { requesterId: currentUser.id }
      ]
    },
    include: {
      requester: true,
      legacySettings: {
        include: { user: true }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return Promise.all(
    pendingRequests.map(async (r) => {
      const requester = await serializeUser(r.requester);
      const targetUser = await serializeUser(r.legacySettings?.user || r.requester);

      return {
        id: r.id,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt,
        requester,
        targetUser,
        legacySettingsId: r.legacySettingsId
      };
    })
  );
};

/**
 * Background Worker: Automatically unlock expired time-capsules
 */
const autoUnlockExpiredVaultItems = async () => {
  const now = new Date();

  const expiredMemories = await prisma.memory.findMany({
    where: {
      isVaultLocked: true,
      unlockAt: {
        not: null,
        lte: now
      }
    }
  });

  if (expiredMemories.length === 0) {
    return { unlockedCount: 0 };
  }

  const result = await prisma.memory.updateMany({
    where: {
      id: { in: expiredMemories.map(m => m.id) }
    },
    data: {
      isVaultLocked: false
    }
  });

  return { unlockedCount: result.count };
};

module.exports = {
  getOrCreateLegacySettings,
  updateLegacySettings,
  requestVaultRelease,
  approveVaultRelease,
  rejectVaultRelease,
  getVaultMemories,
  getFamilyCircleVaults,
  getPendingVaultRequestsForAdmin,
  autoUnlockExpiredVaultItems
};
