const prisma = require("../../config/prisma");
const { createNotification } = require("../notifications/notification.service");
const { serializeUser } = require("../../utils/serializer");
const { serializeMemory } = require("../memories/memory.service");

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
 * Get family members for current user's circle
 */
const getFamilyMembers = async ({ currentUser }) => {
  const circle = await getOrCreateFamilyCircle({ currentUser });

  const members = await prisma.familyMember.findMany({
    where: { familyCircleId: circle.id },
    include: { user: true },
    orderBy: { joinedAt: "asc" }
  });

  const serializedMembers = await Promise.all(
    members.map(async (member) => {
      const user = await serializeUser(member.user);

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
        relationship: member.relationship,
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
const getFamilySharedMemories = async ({ currentUser }) => {
  const circle = await getOrCreateFamilyCircle({ currentUser });

  const members = await prisma.familyMember.findMany({
    where: { familyCircleId: circle.id },
    include: { user: true }
  });

  const memberUserIds = new Set(members.map(m => m.userId));
  const memberFirebaseUids = new Set(members.map(m => m.user?.firebaseUid).filter(Boolean));

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

  connections.forEach(c => {
    const otherUser = c.user1Id === currentUser.id ? c.user2 : c.user1;
    if (otherUser) {
      memberUserIds.add(otherUser.id);
      if (otherUser.firebaseUid) memberFirebaseUids.add(otherUser.firebaseUid);
    }
  });

  const relationshipMap = new Map();
  members.forEach(m => {
    const rel = m.relationship || m.role;
    relationshipMap.set(m.userId, rel === "Admin" || rel === "ADMIN" ? "Circle Creator" : rel);
  });

  const memberIdList = Array.from(memberUserIds);
  const memberUidList = Array.from(memberFirebaseUids);

  const memories = await prisma.memory.findMany({
    where: {
      OR: [
        { ownerId: { in: memberIdList } },
        ...(memberUidList.length > 0 ? [{ ownerFirebaseUid: { in: memberUidList } }] : [])
      ],
      AND: [
        {
          OR: [
            { privacy: { mode: "insensitive", contains: "family" } },
            { privacy: { in: ["Family", "family", "Family Circle", "family circle", "Family Only", "family only", "Family-Only"] } }
          ]
        },
        {
          NOT: {
            privacy: { mode: "insensitive", equals: "public" }
          }
        }
      ]
    },
    orderBy: { occurredAt: "desc" }
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
  declineInvitation
};
