const prisma = require("../../config/prisma");
const { resolvePerspectiveRelationship, getDisplayLabel, normalizeRelationshipCode, inferMultiHopRelationship } = require("./relationshipResolver");
const { createNotification } = require("../notifications/notification.service");
const { serializeUser } = require("../../utils/serializer");
const { serializeMemory } = require("../memories/memory.service");
const { getSignedFileUrl, uploadFileToS3 } = require("../../services/s3.service");

// Debug: Check if prisma is loaded
console.log("Prisma client loaded in familyCircle.service:", !!prisma, typeof prisma);

/**
 * Get or create family circle for user
 * If user has no family circle, creates one with user as admin
 */
const getOrCreateFamilyCircle = async ({ currentUser }) => {
  if (!prisma) {
    throw new Error("Prisma client is not initialized");
  }

  // Check if user already has a family circle (prioritize circles with multiple members)
  const allMemberships = await prisma.familyMember.findMany({
    where: { userId: currentUser.id },
    include: { familyCircle: { include: { members: true } } },
    orderBy: { joinedAt: "desc" }
  }).catch(err => {
    console.error("Prisma query error in getOrCreateFamilyCircle:", err);
    throw new Error(`Database query failed: ${err.message}`);
  });

  if (allMemberships && allMemberships.length > 0) {
    const multiMemberCircle = allMemberships.find(m => m.familyCircle.members.length > 1);
    if (multiMemberCircle) {
      return multiMemberCircle.familyCircle;
    }
    return allMemberships[0].familyCircle;
  }

  // Create new family circle with user as admin
  const newCircle = await prisma.familyCircle.create({
    data: {
      name: `${currentUser.displayName || currentUser.email?.split("@")[0] || "My"}'s Family`,
      description: "Family Circle",
      members: {
        create: {
          userId: currentUser.id,
          role: "ADMIN",
          relationship: "Admin",
          approvedBy: currentUser.id,
          approvedAt: new Date()
        }
      }
    }
  }).catch(err => {
    console.error("Prisma create error in getOrCreateFamilyCircle:", err);
    throw new Error(`Failed to create family circle: ${err.message}`);
  });

  return newCircle;
};

/**
 * Get family circle details with members
 */
const getFamilyCircle = async ({ currentUser, circleId }) => {
  const circle = await prisma.familyCircle.findUnique({
    where: { id: circleId },
    include: {
      members: {
        include: { user: true }
      }
    }
  });

  if (!circle) {
    const error = new Error("Family circle not found");
    error.statusCode = 404;
    throw error;
  }

  // Verify user is a member
  const isMember = circle.members.some(m => m.userId === currentUser.id);
  if (!isMember) {
    const error = new Error("Not authorized to view this family circle");
    error.statusCode = 403;
    throw error;
  }

  // Serialize members
  const serializedMembers = await Promise.all(
    circle.members.map(async (member) => {
      const user = await serializeUser(member.user);
      return {
        ...member,
        user
      };
    })
  );

  return {
    ...circle,
    members: serializedMembers
  };
};

/**
 * Get family members for current user's circle with perspective relationship resolution
 */
const getFamilyMembers = async ({ currentUser }) => {
  const circle = await getOrCreateFamilyCircle({ currentUser });

  const members = await prisma.familyMember.findMany({
    where: { familyCircleId: circle.id },
    include: { user: true },
    orderBy: { joinedAt: "asc" }
  });

  const edges = await prisma.familyRelationshipEdge.findMany({
    where: { familyCircleId: circle.id }
  }).catch(() => []);

  const serializedMembers = await Promise.all(
    members.map(async (member) => {
      const user = await serializeUser(member.user);

      const edge = edges.find(
        (e) => (e.fromUserId === currentUser.id && e.toUserId === member.userId) ||
               (e.fromUserId === member.userId && e.toUserId === currentUser.id)
      );

      const relResolved = resolvePerspectiveRelationship({
        viewerId: currentUser.id,
        targetId: member.userId,
        edge,
        directMemberRelationship: member.relationship,
        targetGender: member.user?.gender
      });

      // Dynamic count of family memories for this user
      const sharedCount = await prisma.memory.count({
        where: {
          ownerId: member.userId,
          privacy: { in: ["Family", "Family Circle", "Family Only", "Public"] }
        }
      });

      return {
        id: user.id,
        name: user.displayName || user.name || user.email?.split("@")[0] || "Family Member",
        email: user.email,
        avatar: user.photoURL || user.avatar || null,
        role: member.role,
        relationship: relResolved.displayLabel,
        relationshipDetails: relResolved,
        isAdmin: member.role === "ADMIN",
        joinedAt: member.joinedAt,
        invitedBy: member.invitedBy,
        sharedCount: sharedCount
      };
    })
  );

  return serializedMembers;
};

/**
 * Get shared memories published by any connected member in user's family circle
 */
const getFamilySharedMemories = async ({ currentUser, targetUserId, type, searchQuery, sort = "newest" }) => {
  const circle = await getOrCreateFamilyCircle({ currentUser });

  const members = await prisma.familyMember.findMany({
    where: { familyCircleId: circle.id },
    include: { user: true }
  });

  const memberUserIds = new Set(members.map((m) => m.userId));
  const memberFirebaseUids = new Set(members.map((m) => m.user?.firebaseUid).filter(Boolean));

  // Add current user ID & Firebase UID so user's own Family memories render in Shared Memories as well
  if (currentUser?.id) memberUserIds.add(currentUser.id);
  if (currentUser?.firebaseUid) memberFirebaseUids.add(currentUser.firebaseUid);

  // Include members from FamilyConnection
  const connections = await prisma.familyConnection.findMany({
    where: {
      OR: [
        { user1Id: currentUser.id },
        { user2Id: currentUser.id }
      ]
    },
    include: { user1: true, user2: true }
  }).catch(() => []);

  connections.forEach((c) => {
    const otherUser = c.user1Id === currentUser.id ? c.user2 : c.user1;
    if (otherUser) {
      memberUserIds.add(otherUser.id);
      if (otherUser.firebaseUid) memberFirebaseUids.add(otherUser.firebaseUid);
    }
  });

  const relationshipMap = new Map();
  members.forEach((m) => {
    const rel = m.relationship || m.role;
    relationshipMap.set(m.userId, rel === "Admin" || rel === "ADMIN" ? "Circle Creator" : rel);
  });

  let filterMemberIdList = Array.from(memberUserIds);
  let filterMemberUidList = Array.from(memberFirebaseUids);

  // If a specific targetUserId filter is selected
  if (targetUserId && targetUserId !== "ALL") {
    filterMemberIdList = [targetUserId];
    const targetUser = members.find((m) => m.userId === targetUserId)?.user;
    filterMemberUidList = targetUser?.firebaseUid ? [targetUser.firebaseUid] : [];
  }

  // Construct search AND conditions
  const andConditions = [
    {
      OR: [
        { privacy: { mode: "insensitive", contains: "family" } },
        { privacy: { in: ["Family", "family", "Family Circle", "family circle", "Family Only", "family only", "Family-Only"] } }
      ]
    }
  ];

  // Media type filter
  if (type && type !== "ALL") {
    if (type.toLowerCase() === "milestone") {
      andConditions.push({
        OR: [
          { type: { mode: "insensitive", equals: "milestone" } },
          { tags: { has: "milestone" } }
        ]
      });
    } else {
      andConditions.push({
        type: { mode: "insensitive", equals: type }
      });
    }
  }

  // Search keyword filter
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim();
    andConditions.push({
      OR: [
        { title: { mode: "insensitive", contains: q } },
        { description: { mode: "insensitive", contains: q } },
        { tags: { has: q.toLowerCase() } }
      ]
    });
  }

  const orderByDirection = sort === "oldest" ? "asc" : "desc";

  const memories = await prisma.memory.findMany({
    where: {
      OR: [
        { ownerId: { in: filterMemberIdList } },
        ...(filterMemberUidList.length > 0 ? [{ ownerFirebaseUid: { in: filterMemberUidList } }] : [])
      ],
      AND: andConditions
    },
    orderBy: { occurredAt: orderByDirection }
  });

  const serialized = await Promise.all(
    memories.map(async (memoryDoc) => {
      const memory = await serializeMemory(memoryDoc, currentUser);
      const ownerRel = relationshipMap.get(memoryDoc.ownerId) || "Family Member";
      return {
        ...memory,
        ownerRelationship: ownerRel
      };
    })
  );

  const uniqueMap = new Map();
  for (const item of serialized) {
    if (!item) continue;
    const titleKey = `${String(item.title || "").trim().toLowerCase()}_${String(item.createdAt || item.date || "").slice(0, 10)}`;
    if (!uniqueMap.has(item.id) && !uniqueMap.has(titleKey)) {
      uniqueMap.set(item.id, item);
      uniqueMap.set(titleKey, item);
    }
  }

  return Array.from(new Set(uniqueMap.values()));
};

/**
 * Check if user is admin of their family circle
 */
const isFamilyAdmin = async ({ currentUser }) => {
  const circle = await getOrCreateFamilyCircle({ currentUser });
  const membership = await prisma.familyMember.findFirst({
    where: {
      userId: currentUser.id,
      familyCircleId: circle.id
    }
  });

  return membership?.role === "ADMIN";
};

/**
 * Add member to family circle (admin only)
 */
const addFamilyMember = async ({ currentUser, targetUserId, relationship }) => {
  // Verify current user is admin
  const isAdmin = await isFamilyAdmin({ currentUser });
  if (!isAdmin) {
    const error = new Error("Only admins can add family members");
    error.statusCode = 403;
    throw error;
  }

  // Get user's family circle
  const circle = await getOrCreateFamilyCircle({ currentUser });

  // Check if target user exists
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId }
  });

  if (!targetUser) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  // Check if already a member
  const existingMember = await prisma.familyMember.findFirst({
    where: {
      familyCircleId: circle.id,
      userId: targetUserId
    }
  });

  if (existingMember) {
    const error = new Error("User is already a member of this family circle");
    error.statusCode = 400;
    throw error;
  }

  // Add as member
  const newMember = await prisma.familyMember.create({
    data: {
      familyCircleId: circle.id,
      userId: targetUserId,
      role: "MEMBER",
      relationship: relationship || "Family Member",
      invitedBy: currentUser.id,
      approvedBy: currentUser.id,
      approvedAt: new Date()
    },
    include: { user: true }
  });

  const serializedUser = await serializeUser(newMember.user);

  return {
    ...newMember,
    user: serializedUser
  };
};

/**
 * Remove member from family circle (admin only)
 */
const removeFamilyMember = async ({ currentUser, targetUserId }) => {
  // Verify current user is admin
  const isAdmin = await isFamilyAdmin({ currentUser });
  if (!isAdmin) {
    const error = new Error("Only admins can remove family members");
    error.statusCode = 403;
    throw error;
  }

  // Get user's family circle
  const circle = await getOrCreateFamilyCircle({ currentUser });

  // Check if trying to remove self
  if (targetUserId === currentUser.id) {
    const error = new Error("You cannot remove yourself. Leave the circle instead.");
    error.statusCode = 400;
    throw error;
  }

  // Check if target is admin
  const targetMember = await prisma.familyMember.findFirst({
    where: {
      familyCircleId: circle.id,
      userId: targetUserId
    }
  });

  if (!targetMember) {
    const error = new Error("User is not a member of this family circle");
    error.statusCode = 404;
    throw error;
  }

  // Count total admins
  const adminCount = await prisma.familyMember.count({
    where: {
      familyCircleId: circle.id,
      role: "ADMIN"
    }
  });

  // Prevent removing last admin
  if (targetMember.role === "ADMIN" && adminCount <= 1) {
    const error = new Error("Cannot remove the last admin. Promote another member first.");
    error.statusCode = 400;
    throw error;
  }

  // Remove member
  await prisma.familyMember.delete({
    where: { id: targetMember.id }
  });

  // Invalidate legacy administrator assignments where targetUserId was assigned (Phase 10)
  await prisma.legacySettings.updateMany({
    where: { administratorId: targetUserId },
    data: {
      administratorId: null,
      administratorName: "Unassigned"
    }
  });

  return { message: "Member removed successfully" };
};

/**
 * Promote member to admin (admin only)
 */
const promoteToAdmin = async ({ currentUser, targetUserId }) => {
  // Verify current user is admin
  const isAdmin = await isFamilyAdmin({ currentUser });
  if (!isAdmin) {
    const error = new Error("Only admins can promote members");
    error.statusCode = 403;
    throw error;
  }

  // Get user's family circle
  const circle = await getOrCreateFamilyCircle({ currentUser });

  // Find target member
  const targetMember = await prisma.familyMember.findFirst({
    where: {
      familyCircleId: circle.id,
      userId: targetUserId
    }
  });

  if (!targetMember) {
    const error = new Error("User is not a member of this family circle");
    error.statusCode = 404;
    throw error;
  }

  if (targetMember.role === "ADMIN") {
    const error = new Error("User is already an admin");
    error.statusCode = 400;
    throw error;
  }

  // Promote to admin
  const updatedMember = await prisma.familyMember.update({
    where: { id: targetMember.id },
    data: { role: "ADMIN" },
    include: { user: true }
  });

  const serializedUser = await serializeUser(updatedMember.user);

  return {
    ...updatedMember,
    user: serializedUser
  };
};

/**
 * Demote admin to member (admin only)
 */
const demoteFromAdmin = async ({ currentUser, targetUserId }) => {
  // Verify current user is admin
  const isAdmin = await isFamilyAdmin({ currentUser });
  if (!isAdmin) {
    const error = new Error("Only admins can demote admins");
    error.statusCode = 403;
    throw error;
  }

  // Get user's family circle
  const circle = await getOrCreateFamilyCircle({ currentUser });

  // Find target member
  const targetMember = await prisma.familyMember.findFirst({
    where: {
      familyCircleId: circle.id,
      userId: targetUserId
    }
  });

  if (!targetMember) {
    const error = new Error("User is not a member of this family circle");
    error.statusCode = 404;
    throw error;
  }

  if (targetMember.role !== "ADMIN") {
    const error = new Error("User is not an admin");
    error.statusCode = 400;
    throw error;
  }

  // Prevent demoting self
  if (targetUserId === currentUser.id) {
    const error = new Error("You cannot demote yourself");
    error.statusCode = 400;
    throw error;
  }

  // Count total admins
  const adminCount = await prisma.familyMember.count({
    where: {
      familyCircleId: circle.id,
      role: "ADMIN"
    }
  });

  // Prevent demoting last admin
  if (adminCount <= 1) {
    const error = new Error("Cannot demote the last admin");
    error.statusCode = 400;
    throw error;
  }

  // Demote to member
  const updatedMember = await prisma.familyMember.update({
    where: { id: targetMember.id },
    data: { role: "MEMBER" },
    include: { user: true }
  });

  const serializedUser = await serializeUser(updatedMember.user);

  return {
    ...updatedMember,
    user: serializedUser
  };
};

/**
 * Get pending approvals for admin
 */
const getPendingApprovals = async ({ currentUser }) => {
  // Verify current user is admin
  const isAdmin = await isFamilyAdmin({ currentUser });
  if (!isAdmin) {
    const error = new Error("Only admins can view pending approvals");
    error.statusCode = 403;
    throw error;
  }

  // Get user's family circle
  const circle = await getOrCreateFamilyCircle({ currentUser });

  // Get invitations with ACCEPTED status (waiting for admin approval)
  const pendingInvitations = await prisma.familyInvitation.findMany({
    where: {
      familyCircleId: circle.id,
      status: "ACCEPTED"
    },
    include: {
      sender: true,
      receiver: true
    },
    orderBy: { acceptedAt: "desc" }
  });

  const serializedInvitations = await Promise.all(
    pendingInvitations.map(async (inv) => {
      const sender = await serializeUser(inv.sender);
      const receiver = inv.receiver ? await serializeUser(inv.receiver) : null;
      return {
        id: inv.id,
        sender,
        receiver,
        receiverName: receiver?.displayName || receiver?.name || inv.email || inv.phoneNumber || "Family Member",
        receiverAvatar: receiver?.photoURL || receiver?.avatar || null,
        email: inv.email || receiver?.email,
        phoneNumber: inv.phoneNumber,
        countryCode: inv.countryCode,
        relationship: inv.relationship || "Family Member",
        method: inv.method,
        status: inv.status,
        acceptedAt: inv.acceptedAt
      };
    })
  );

  return serializedInvitations;
};

/**
 * Approve pending invitation (admin only)
 */
const approveInvitation = async ({ currentUser, invitationId }) => {
  // Verify current user is admin
  const isAdmin = await isFamilyAdmin({ currentUser });
  if (!isAdmin) {
    const error = new Error("Only admins can approve invitations");
    error.statusCode = 403;
    throw error;
  }

  // Get invitation
  const invitation = await prisma.familyInvitation.findUnique({
    where: { id: invitationId },
    include: { familyCircle: true, receiver: true }
  });

  if (!invitation) {
    const error = new Error("Invitation not found");
    error.statusCode = 404;
    throw error;
  }

  if (invitation.status !== "ACCEPTED") {
    const error = new Error("Invitation is not in accepted state");
    error.statusCode = 400;
    throw error;
  }

  if (!invitation.receiver) {
    const error = new Error("No receiver found for this invitation");
    error.statusCode = 400;
    throw error;
  }

  // Update invitation status
  await prisma.familyInvitation.update({
    where: { id: invitationId },
    data: {
      status: "APPROVED",
      approvedAt: new Date()
    }
  });

  // Add user to family circle
  const newMember = await prisma.familyMember.create({
    data: {
      familyCircleId: invitation.familyCircleId,
      userId: invitation.receiverId,
      role: "MEMBER",
      relationship: invitation.relationship,
      invitedBy: invitation.senderId,
      approvedBy: currentUser.id,
      approvedAt: new Date()
    },
    include: { user: true }
  });

  // Create bidirectional FamilyConnection record
  if (invitation.senderId && invitation.receiverId) {
    const [u1, u2] = [invitation.senderId, invitation.receiverId].sort();
    await prisma.familyConnection.upsert({
      where: {
        user1Id_user2Id: {
          user1Id: u1,
          user2Id: u2
        }
      },
      create: {
        user1Id: u1,
        user2Id: u2
      },
      update: {}
    }).catch(err => {
      console.warn("Could not create FamilyConnection on approval:", err.message);
    });

    // Clean up any orphaned single-member circle created by receiver prior to joining
    try {
      const soloMemberships = await prisma.familyMember.findMany({
        where: { userId: invitation.receiverId },
        include: { familyCircle: { include: { members: true } } }
      });
      for (const mem of soloMemberships) {
        if (mem.familyCircleId !== invitation.familyCircleId && mem.familyCircle.members.length <= 1) {
          await prisma.familyMember.deleteMany({ where: { familyCircleId: mem.familyCircleId } });
          await prisma.familyCircle.delete({ where: { id: mem.familyCircleId } }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn("Solo circle cleanup warning:", err.message);
    }
  }

  // Create notification for the user who was approved
  if (invitation.receiver) {
    const adminName = currentUser.displayName || currentUser.name || currentUser.email?.split("@")[0] || "Admin";
    const familyCircleName = invitation.familyCircle.name;
    
    await createNotification({
      userId: invitation.receiverId,
      type: "FAMILY_INVITE_APPROVED",
      title: "Family Circle Invitation Approved",
      message: `${adminName} has approved your request to join ${familyCircleName} as ${invitation.relationship}. You are now a member!`,
      metadata: {
        invitationId: invitation.id,
        familyCircleId: invitation.familyCircleId,
        approvedBy: currentUser.id,
        relationship: invitation.relationship
      },
      actionUrl: "/family"
    });
  }

  const serializedUser = await serializeUser(newMember.user);

  return {
    ...newMember,
    user: serializedUser
  };
};

/**
 * Decline pending invitation (admin only)
 */
const declineInvitation = async ({ currentUser, invitationId }) => {
  // Verify current user is admin
  const isAdmin = await isFamilyAdmin({ currentUser });
  if (!isAdmin) {
    const error = new Error("Only admins can decline invitations");
    error.statusCode = 403;
    throw error;
  }

  // Get invitation with receiver details
  const invitation = await prisma.familyInvitation.findUnique({
    where: { id: invitationId },
    include: {
      receiver: true,
      familyCircle: true
    }
  });

  // Update invitation status
  await prisma.familyInvitation.update({
    where: { id: invitationId },
    data: { status: "DECLINED" }
  });

  // Create notification for the user who was declined
  if (invitation && invitation.receiver) {
    const adminName = currentUser.displayName || currentUser.name || currentUser.email?.split("@")[0] || "Admin";
    const familyCircleName = invitation.familyCircle?.name || "Family Circle";
    
    await createNotification({
      userId: invitation.receiverId,
      type: "FAMILY_INVITE_DECLINED",
      title: "Family Circle Invitation Declined",
      message: `${adminName} has declined your request to join ${familyCircleName}. You may contact them for more information.`,
      metadata: {
        invitationId: invitation.id,
        familyCircleId: invitation.familyCircleId,
        declinedBy: currentUser.id
      },
      actionUrl: "/family"
    });
  }

  return { message: "Invitation declined" };
};

/**
 * Non-destructive linking of an individual memory to a Family Circle
 */
const linkMemoryToFamilyCircle = async ({ currentUser, familyCircleId, memoryId }) => {
  const memory = await prisma.memory.findUnique({
    where: { id: memoryId }
  });
  if (!memory) {
    const error = new Error("Memory not found");
    error.statusCode = 404;
    throw error;
  }

  const member = await prisma.familyMember.findFirst({
    where: { familyCircleId, userId: currentUser.id, status: "ACTIVE" }
  });
  if (!member) {
    const error = new Error("Not authorized. You are not an active member of this Family Space.");
    error.statusCode = 403;
    throw error;
  }

  const link = await prisma.familyMemoryLink.upsert({
    where: {
      familyCircleId_memoryId: {
        familyCircleId,
        memoryId
      }
    },
    create: {
      familyCircleId,
      memoryId,
      linkedById: currentUser.id,
      occurredAt: memory.occurredAt || new Date()
    },
    update: {}
  });

  return link;
};

/**
 * Remove link reference ONLY (never deletes original Memory or S3 file)
 */
const unlinkMemoryFromFamilyCircle = async ({ currentUser, familyCircleId, memoryId }) => {
  const link = await prisma.familyMemoryLink.findUnique({
    where: {
      familyCircleId_memoryId: {
        familyCircleId,
        memoryId
      }
    }
  });

  if (!link) {
    const error = new Error("Link not found");
    error.statusCode = 404;
    throw error;
  }

  const member = await prisma.familyMember.findFirst({
    where: { familyCircleId, userId: currentUser.id, status: "ACTIVE" }
  });

  const isLinker = link.linkedById === currentUser.id;
  const isAdmin = member?.role === "ADMIN";

  if (!isLinker && !isAdmin) {
    const error = new Error("Not authorized to unlink this memory");
    error.statusCode = 403;
    throw error;
  }

  await prisma.familyMemoryLink.delete({
    where: { id: link.id }
  });

  return { message: "Memory unlinked successfully from Family Space" };
};

/**
 * Cursor-paginated timeline query for Family Space
 */
const getFamilyCircleTimeline = async ({ currentUser, familyCircleId, limit = 20, cursor }) => {
  const member = await prisma.familyMember.findFirst({
    where: { familyCircleId, userId: currentUser.id, status: "ACTIVE" }
  });

  if (!member) {
    const error = new Error("Not authorized to view this timeline");
    error.statusCode = 403;
    throw error;
  }

  const queryLimit = Math.min(Number(limit) || 20, 50);

  const links = await prisma.familyMemoryLink.findMany({
    where: { familyCircleId },
    take: queryLimit + 1,
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : 0,
    orderBy: { occurredAt: "desc" },
    include: {
      memory: {
        include: {
          mediaAssets: { orderBy: { orderIndex: "asc" } },
          owner: true
        }
      },
      linkedBy: true
    }
  });

  let nextCursor = null;
  if (links.length > queryLimit) {
    const nextItem = links.pop();
    nextCursor = nextItem.id;
  }

  const items = await Promise.all(
    links.map(async (link) => {
      const memory = await serializeMemory(link.memory, currentUser);
      const linker = await serializeUser(link.linkedBy);
      return {
        linkId: link.id,
        isPinned: link.isPinned,
        linkedAt: link.createdAt,
        linkedBy: linker,
        memory
      };
    })
  );

  return {
    items,
    nextCursor,
    hasMore: !!nextCursor
  };
};

/**
 * Story Layers (Multi-perspective contributions to a memory)
 */
const addStoryLayer = async ({ currentUser, memoryId, text, audioKey, audioDuration }) => {
  const memory = await prisma.memory.findUnique({ where: { id: memoryId } });
  if (!memory) {
    const error = new Error("Memory not found");
    error.statusCode = 404;
    throw error;
  }

  const storyLayer = await prisma.storyLayer.create({
    data: {
      memoryId,
      authorId: currentUser.id,
      text: text || "",
      audioKey: audioKey || null,
      audioDuration: audioDuration ? Number(audioDuration) : null,
    },
    include: { author: true },
  });

  const author = await serializeUser(storyLayer.author);
  return { ...storyLayer, author };
};

const getStoryLayers = async ({ memoryId }) => {
  const layers = await prisma.storyLayer.findMany({
    where: { memoryId },
    include: { author: true },
    orderBy: { createdAt: "asc" },
  });

  return Promise.all(
  layers.map(async (layer) => {
      const author = await serializeUser(layer.author);
      return { ...layer, author };
    })
  );
};

async function processAudioUpload(audioKey, audioUrl, folder = "family-prompts") {
  const raw = audioKey || audioUrl;
  if (!raw) return null;

  if (!raw.startsWith("data:")) {
    return raw;
  }

  try {
    const matches = raw.match(/^data:([^;]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const mimeType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, "base64");
      const ext = mimeType.includes("mp3") ? ".mp3" : mimeType.includes("wav") ? ".wav" : ".webm";
      const fileName = `voice-${Date.now()}${ext}`;

      const uploadResult = await uploadFileToS3({
        file: {
          buffer,
          originalname: fileName,
          mimetype: mimeType
        },
        folder
      });
      if (uploadResult?.key) {
        return uploadResult.key;
      }
    }
  } catch (err) {
    console.warn("Base64 S3 audio upload warning, preserving raw string:", err.message);
  }

  return raw;
}

/**
 * Ask the Family Prompts Engine
 */
const createFamilyPrompt = async ({ currentUser, familyCircleId, question, category, audioKey, audioUrl }) => {
  const effectiveKey = await processAudioUpload(audioKey, audioUrl, "family-prompts");

  const prompt = await prisma.familyPrompt.create({
    data: {
      familyCircleId,
      createdById: currentUser.id,
      question: question || "Voice Question",
      audioKey: effectiveKey,
      category: category || "Heritage",
    },
    include: {
      createdBy: true,
      responses: { include: { author: true } },
    },
  });

  const createdBy = await serializeUser(prompt.createdBy);
  let finalAudioUrl = prompt.audioKey ? await getSignedFileUrl(prompt.audioKey) : null;

  return { ...prompt, createdBy, audioUrl: finalAudioUrl, audioKey: prompt.audioKey };
};

const getFamilyPrompts = async ({ currentUser, familyCircleId }) => {
  const prompts = await prisma.familyPrompt.findMany({
    where: { familyCircleId, isActive: true },
    include: {
      createdBy: true,
      responses: {
        include: { author: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    prompts.map(async (p) => {
      const createdBy = await serializeUser(p.createdBy);
      let promptAudioUrl = p.audioKey ? await getSignedFileUrl(p.audioKey) : null;

      const responses = await Promise.all(
        p.responses.map(async (r) => {
          const author = await serializeUser(r.author);
          let audioUrl = r.audioKey ? await getSignedFileUrl(r.audioKey) : null;
          return { ...r, author, audioUrl, audioKey: r.audioKey };
        })
      );
      return { ...p, createdBy, audioUrl: promptAudioUrl, audioKey: p.audioKey, responses };
    })
  );
};

const respondToFamilyPrompt = async ({ currentUser, promptId, text, audioKey, audioUrl }) => {
  const prompt = await prisma.familyPrompt.findUnique({ where: { id: promptId } });
  if (!prompt) {
    const error = new Error("Family prompt not found");
    error.statusCode = 404;
    throw error;
  }

  const effectiveKey = await processAudioUpload(audioKey, audioUrl, "family-responses");

  const response = await prisma.familyResponse.create({
    data: {
      promptId,
      authorId: currentUser.id,
      text: text || "Voice Answer",
      audioKey: effectiveKey,
    },
    include: { author: true },
  });

  const author = await serializeUser(response.author);
  let finalAudioUrl = response.audioKey ? await getSignedFileUrl(response.audioKey) : null;

  return { ...response, author, audioUrl: finalAudioUrl, audioKey: response.audioKey };
};

/**
 * Guardian & Minor Controls (Phase 4)
 */
const getGuardianControls = async ({ currentUser, familyCircleId }) => {
  const minorMembers = await prisma.familyMember.findMany({
    where: {
      familyCircleId,
      role: "RESTRICTED_MINOR",
    },
    include: {
      user: {
        include: {
          childConsents: true,
        },
      },
    },
  });

  return Promise.all(
    minorMembers.map(async (m) => {
      const user = await serializeUser(m.user);
      const consent = m.user.childConsents?.[0] || null;
      return {
        memberId: m.id,
        user,
        consent,
      };
    })
  );
};

const updateGuardianConsent = async ({ currentUser, childUserId, status, canPostWithoutApproval, allowMediaUploads }) => {
  const consent = await prisma.guardianConsent.upsert({
    where: { childUserId },
    create: {
      childUserId,
      guardianUserId: currentUser.id,
      status: status || "APPROVED",
      canPostWithoutApproval: canPostWithoutApproval !== undefined ? Boolean(canPostWithoutApproval) : false,
      allowMediaUploads: allowMediaUploads !== undefined ? Boolean(allowMediaUploads) : true,
    },
    update: {
      ...(status && { status }),
      ...(canPostWithoutApproval !== undefined && { canPostWithoutApproval: Boolean(canPostWithoutApproval) }),
      ...(allowMediaUploads !== undefined && { allowMediaUploads: Boolean(allowMediaUploads) }),
    },
  });

  return consent;
};

const upsertRelationshipEdge = async ({ currentUser, familyCircleId, toUserId, relationshipCode, side }) => {
  if (currentUser.id === toUserId) {
    const error = new Error("Cannot create a relationship edge to yourself.");
    error.statusCode = 400;
    throw error;
  }

  const normCode = normalizeRelationshipCode(relationshipCode);

  // Validate contradictory edge (e.g. A -> FATHER -> B and B -> FATHER -> A)
  const reverseEdge = await prisma.familyRelationshipEdge.findUnique({
    where: {
      familyCircleId_fromUserId_toUserId: {
        familyCircleId,
        fromUserId: toUserId,
        toUserId: currentUser.id
      }
    }
  }).catch(() => null);

  if (reverseEdge && reverseEdge.relationshipCode === normCode && ["FATHER", "MOTHER", "PATERNAL_GRANDMOTHER", "MATERNAL_GRANDMOTHER", "PATERNAL_GRANDFATHER", "MATERNAL_GRANDFATHER", "SON", "DAUGHTER"].includes(normCode)) {
    const error = new Error(`Contradictory relationship detected: Both users cannot be set as ${getDisplayLabel(normCode)} to each other.`);
    error.statusCode = 400;
    throw error;
  }

  const edge = await prisma.familyRelationshipEdge.upsert({
    where: {
      familyCircleId_fromUserId_toUserId: {
        familyCircleId,
        fromUserId: currentUser.id,
        toUserId
      }
    },
    create: {
      familyCircleId,
      fromUserId: currentUser.id,
      toUserId,
      relationshipCode: normCode,
      side: side || "UNSPECIFIED"
    },
    update: {
      relationshipCode: normCode,
      side: side || "UNSPECIFIED"
    }
  });

  return {
    ...edge,
    displayLabel: getDisplayLabel(normCode)
  };
};

function getGenerationalTier(code) {
  switch (code) {
    case "PATERNAL_GRANDMOTHER":
    case "MATERNAL_GRANDMOTHER":
    case "PATERNAL_GRANDFATHER":
    case "MATERNAL_GRANDFATHER":
    case "GRANDMOTHER":
    case "GRANDFATHER":
      return -2;

    case "FATHER":
    case "MOTHER":
    case "PARENT":
    case "PATERNAL_UNCLE":
    case "MATERNAL_UNCLE":
    case "PATERNAL_AUNT":
    case "MATERNAL_AUNT":
    case "UNCLE":
    case "AUNT":
      return -1;

    case "SELF":
    case "HUSBAND":
    case "WIFE":
    case "SPOUSE":
    case "BROTHER":
    case "SISTER":
    case "SIBLING":
    case "COUSIN":
    case "PATERNAL_COUSIN":
    case "MATERNAL_COUSIN":
      return 0;

    case "SON":
    case "DAUGHTER":
    case "CHILD":
    case "NEPHEW":
    case "NIECE":
    case "NIBLING":
      return 1;

    case "GRANDSON":
    case "GRANDDAUGHTER":
    case "GRANDCHILD":
      return 2;

    default:
      return 99;
  }
}

const getRelationshipGraph = async ({ currentUser, familyCircleId }) => {
  const members = await prisma.familyMember.findMany({
    where: { familyCircleId },
    include: { user: true }
  });

  const edges = await prisma.familyRelationshipEdge.findMany({
    where: { familyCircleId }
  });

  const nodes = await Promise.all(
    members.map(async (m) => {
      const u = await serializeUser(m.user);

      const edge = edges.find(
        (e) => (e.fromUserId === currentUser.id && e.toUserId === m.userId) ||
               (e.fromUserId === m.userId && e.toUserId === currentUser.id)
      );

      let relResolved = resolvePerspectiveRelationship({
        viewerId: currentUser.id,
        targetId: m.userId,
        edge,
        directMemberRelationship: m.relationship,
        targetGender: m.user?.gender
      });

      // If no direct edge exists, attempt multi-hop graph inference
      if (!edge && m.userId !== currentUser.id) {
        const inferred = inferMultiHopRelationship({
          viewerId: currentUser.id,
          targetId: m.userId,
          edges,
          targetGender: m.user?.gender
        });
        if (inferred) {
          relResolved = inferred;
        }
      }

      const tier = relResolved.isSelf ? 0 : getGenerationalTier(relResolved.code);

      return {
        id: u.id,
        userId: m.userId,
        name: u.displayName || u.name || "Family Member",
        email: u.email,
        avatar: u.photoURL || u.avatar,
        role: m.role,
        relationshipCode: relResolved.code,
        displayLabel: relResolved.displayLabel,
        side: relResolved.side,
        isSelf: Boolean(relResolved.isSelf),
        tier
      };
    })
  );

  const resolvedEdges = edges.map((e) => ({
    id: e.id,
    fromUserId: e.fromUserId,
    toUserId: e.toUserId,
    relationshipCode: e.relationshipCode,
    displayLabel: getDisplayLabel(e.relationshipCode),
    side: e.side
  }));

  return {
    nodes,
    edges: resolvedEdges
  };
};

module.exports = {
  getOrCreateFamilyCircle,
  getFamilyCircle,
  getFamilyMembers,
  getFamilySharedMemories,
  isFamilyAdmin,
  addFamilyMember,
  removeFamilyMember,
  promoteToAdmin,
  demoteFromAdmin,
  getPendingApprovals,
  approveInvitation,
  declineInvitation,
  linkMemoryToFamilyCircle,
  unlinkMemoryFromFamilyCircle,
  getFamilyCircleTimeline,
  addStoryLayer,
  getStoryLayers,
  createFamilyPrompt,
  getFamilyPrompts,
  respondToFamilyPrompt,
  getGuardianControls,
  updateGuardianConsent,
  upsertRelationshipEdge,
  getRelationshipGraph
};
