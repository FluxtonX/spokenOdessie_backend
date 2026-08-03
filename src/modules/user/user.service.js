const prisma = require("../../config/prisma");
const { getSignedFileUrl } = require("../../services/s3.service");
const { getOrCreateFamilyCircle } = require("../familyCircle/familyCircle.service");
const { sendInvitationSMS, formatPhoneNumber } = require("../sms/sms.service");
const { generateInvitationQR } = require("../qr/qr.service");
const { createNotification } = require("../notifications/notification.service");
const { serializeUser } = require("../../utils/serializer");
const crypto = require("crypto");

const getSuggestedPeople = async ({ currentUser }) => {
  // Get connected family members
  const connections = await prisma.familyConnection.findMany({
    where: {
      OR: [
        { user1Id: currentUser.id },
        { user2Id: currentUser.id }
      ]
    }
  });
  const connectedUids = connections.map(c => c.user1Id === currentUser.id ? c.user2Id : c.user1Id);

  // Get followed users
  const followingLogs = await prisma.follow.findMany({
    where: { followerId: currentUser.id }
  });
  const followedUids = followingLogs.map(f => f.followingId);

  // Suggest users who are not current user and not connected/followed
  const excludedUids = [currentUser.id, ...connectedUids, ...followedUids];

  const suggestedUsers = await prisma.user.findMany({
    where: {
      id: { notIn: excludedUids }
    },
    take: 50
  });

  return Promise.all(suggestedUsers.map(u => serializeUser(u)));
};

const getFeaturedPeople = async ({ currentUser, category, query }) => {
  const currentUserId = currentUser?.id;
  const whereClause = {
    isActive: true,
  };

  if (currentUserId) {
    whereClause.id = { not: currentUserId };
  }

  if (query && query.trim()) {
    const keywords = query.trim().split(/\s+/).filter(Boolean);
    const searchConditions = keywords.flatMap((kw) => [
      { displayName: { contains: kw, mode: "insensitive" } },
      { email: { contains: kw, mode: "insensitive" } },
      { profession: { contains: kw, mode: "insensitive" } },
      { bio: { contains: kw, mode: "insensitive" } },
      { location: { contains: kw, mode: "insensitive" } },
    ]);
    whereClause.OR = searchConditions;
  }

  const users = await prisma.user.findMany({
    where: whereClause,
    include: {
      _count: {
        select: { followers: true }
      },
      followers: currentUserId ? {
        where: { followerId: currentUserId }
      } : false
    },
    take: 50,
    orderBy: { createdAt: "desc" }
  });

  return Promise.all(
    users.map(async (u) => {
      const serialized = await serializeUser(u);
      return {
        ...serialized,
        followersCount: u._count?.followers || 0,
        isFollowing: Array.isArray(u.followers) && u.followers.length > 0
      };
    })
  );
};

const getFamilyMembers = async ({ currentUser }) => {
  const connections = await prisma.familyConnection.findMany({
    where: {
      OR: [
        { user1Id: currentUser.id },
        { user2Id: currentUser.id }
      ]
    }
  });
  const familyUids = connections.map(c => c.user1Id === currentUser.id ? c.user2Id : c.user1Id);

  if (!familyUids.length) return [];

  const familyUsers = await prisma.user.findMany({
    where: { id: { in: familyUids } }
  });
  return Promise.all(familyUsers.map(u => serializeUser(u)));
};

const sendFamilyInvitation = async ({ currentUser, email, firebaseUid, relationship, method = "EMAIL" }) => {
  const cleanEmail = email ? email.trim().toLowerCase() : "";
  let targetUser = null;

  if (firebaseUid) {
    targetUser = await prisma.user.findUnique({ where: { id: firebaseUid } });
  } else if (cleanEmail) {
    targetUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
  }

  if (!targetUser && !cleanEmail) {
    const error = new Error("Email or User ID is required");
    error.statusCode = 400;
    throw error;
  }

  if (targetUser && targetUser.id === currentUser.id) {
    const error = new Error("You cannot invite yourself");
    error.statusCode = 400;
    throw error;
  }

  // Get or create family circle for sender
  const familyCircle = await getOrCreateFamilyCircle({ currentUser });

  // Check if already a member of the family circle
  if (targetUser) {
    const existingMember = await prisma.familyMember.findFirst({
      where: {
        familyCircleId: familyCircle.id,
        userId: targetUser.id
      }
    });
    if (existingMember) {
      return {
        message: "Already a member of your Family Circle!",
        connected: true,
        user: await serializeUser(targetUser)
      };
    }
  }

  // Check if invitation already exists and is not expired/declined
  const existingInvite = await prisma.familyInvitation.findFirst({
    where: {
      familyCircleId: familyCircle.id,
      senderId: currentUser.id,
      OR: [
        { email: cleanEmail || (targetUser ? targetUser.email : "") },
        targetUser ? { receiverId: targetUser.id } : {}
      ],
      status: { in: ["PENDING", "ACCEPTED"] }
    }
  });

  if (existingInvite) {
    return {
      message: "Invitation already sent! Waiting for recipient to accept.",
      invitation: existingInvite
    };
  }

  // Generate unique invitation token
  const invitationToken = crypto.randomUUID();

  // Create new invitation record
  const newInvitation = await prisma.familyInvitation.create({
    data: {
      familyCircleId: familyCircle.id,
      senderId: currentUser.id,
      receiverId: targetUser ? targetUser.id : null,
      email: cleanEmail || (targetUser ? targetUser.email : ""),
      relationship: relationship || "Family Member",
      status: "PENDING",
      method,
      invitationToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    }
  });

  // Trigger Brevo Family Invitation Email if recipient has an email address
  const inviteEmail = cleanEmail || (targetUser ? targetUser.email : "");
  if (inviteEmail) {
    try {
      const { sendFamilyInvitationEmail } = require("../../services/email.service");
      const clientUrl = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(",")[0].trim() : "http://localhost:3000";
      const inviteUrl = `${clientUrl}/family/join?token=${invitationToken}`;
      const senderName = currentUser.displayName || currentUser.email?.split("@")[0] || "A family member";

      await sendFamilyInvitationEmail({
        toEmail: inviteEmail,
        senderName,
        relationship: relationship || "Family Member",
        inviteUrl,
      });
    } catch (emailErr) {
      console.warn("Could not send family invitation email via Brevo:", emailErr.message);
    }
  }

  return {
    message: `Invitation successfully sent to ${targetUser?.displayName || cleanEmail}!`,
    invitation: newInvitation,
    receiver: targetUser ? await serializeUser(targetUser) : null,
    invitationToken
  };
};

const getPendingInvitations = async ({ currentUser }) => {
  const invitations = await prisma.familyInvitation.findMany({
    where: {
      AND: [
        {
          OR: [
            { receiverId: currentUser.id },
            { email: currentUser.email.toLowerCase() }
          ]
        },
        { status: "PENDING" }
      ]
    },
    include: {
      sender: true
    },
    orderBy: { createdAt: "desc" }
  });

  const serializedInvites = await Promise.all(
    invitations.map(async (inv) => {
      const senderProfile = await serializeUser(inv.sender);
      return {
        id: inv.id,
        relationship: inv.relationship,
        status: inv.status,
        createdAt: inv.createdAt,
        sender: senderProfile
      };
    })
  );

  return serializedInvites;
};

const acceptFamilyInvitation = async ({ currentUser, invitationId }) => {
  const invitation = await prisma.familyInvitation.findUnique({
    where: { id: invitationId },
    include: { sender: true, familyCircle: true }
  });

  if (!invitation) {
    const error = new Error("Invitation not found");
    error.statusCode = 404;
    throw error;
  }

  // Check if expired
  if (invitation.expiresAt && new Date() > invitation.expiresAt) {
    await prisma.familyInvitation.update({
      where: { id: invitationId },
      data: { status: "EXPIRED" }
    });
    const error = new Error("Invitation has expired");
    error.statusCode = 400;
    throw error;
  }

  // Verify authorization
  const isReceiver = invitation.receiverId === currentUser.id || 
                    (invitation.email && invitation.email.toLowerCase() === currentUser.email.toLowerCase());
  if (!isReceiver) {
    const error = new Error("Not authorized to accept this invitation");
    error.statusCode = 403;
    throw error;
  }

  if (invitation.status !== "PENDING") {
    const error = new Error(`Invitation is already ${invitation.status.toLowerCase()}`);
    error.statusCode = 400;
    throw error;
  }

  // Mark invitation as accepted (waiting for admin approval)
  await prisma.familyInvitation.update({
    where: { id: invitationId },
    data: {
      status: "ACCEPTED",
      receiverId: currentUser.id,
      acceptedAt: new Date()
    }
  });

  return {
    message: "Invitation accepted! Waiting for admin approval to join the Family Circle.",
    invitation: {
      id: invitation.id,
      familyCircleName: invitation.familyCircle.name,
      senderName: invitation.sender.displayName || invitation.sender.email?.split("@")[0],
      relationship: invitation.relationship
    }
  };
};

const declineFamilyInvitation = async ({ currentUser, invitationId }) => {
  const invitation = await prisma.familyInvitation.findUnique({
    where: { id: invitationId }
  });

  if (!invitation) {
    const error = new Error("Invitation not found");
    error.statusCode = 404;
    throw error;
  }

  const isReceiver = invitation.receiverId === currentUser.id || invitation.email.toLowerCase() === currentUser.email.toLowerCase();
  if (!isReceiver) {
    const error = new Error("Not authorized to decline this invitation");
    error.statusCode = 403;
    throw error;
  }

  await prisma.familyInvitation.update({
    where: { id: invitationId },
    data: { status: "DECLINED" }
  });

  return {
    message: "Invitation declined."
  };
};

const connectFamilyMember = sendFamilyInvitation;

/**
 * Send SMS invitation
 */
const sendSMSInvitation = async ({ currentUser, phoneNumber, countryCode, relationship }) => {
  const cleanPhone = phoneNumber?.replace(/\D/g, "") || "";
  const cleanCountryCode = countryCode || "+1";

  if (!cleanPhone) {
    const error = new Error("Phone number is required");
    error.statusCode = 400;
    throw error;
  }

  // Check if user already exists with this phone
  const targetUser = await prisma.user.findFirst({
    where: { phoneNumber: cleanPhone }
  });

  if (targetUser && targetUser.id === currentUser.id) {
    const error = new Error("You cannot invite yourself");
    error.statusCode = 400;
    throw error;
  }

  // Get or create family circle for sender
  const familyCircle = await getOrCreateFamilyCircle({ currentUser });

  // Check if already a member
  if (targetUser) {
    const existingMember = await prisma.familyMember.findFirst({
      where: {
        familyCircleId: familyCircle.id,
        userId: targetUser.id
      }
    });
    if (existingMember) {
      return {
        message: "Already a member of your Family Circle!",
        connected: true,
        user: await serializeUser(targetUser)
      };
    }
  }

  // Check if invitation already exists
  const existingInvite = await prisma.familyInvitation.findFirst({
    where: {
      familyCircleId: familyCircle.id,
      senderId: currentUser.id,
      phoneNumber: cleanPhone,
      status: { in: ["PENDING", "ACCEPTED"] }
    }
  });

  if (existingInvite) {
    return {
      message: "Invitation already sent to this phone number!",
      invitation: existingInvite
    };
  }

  // Generate unique invitation token
  const invitationToken = crypto.randomUUID();

  // Create invitation record
  const newInvitation = await prisma.familyInvitation.create({
    data: {
      familyCircleId: familyCircle.id,
      senderId: currentUser.id,
      receiverId: targetUser ? targetUser.id : null,
      phoneNumber: cleanPhone,
      countryCode: cleanCountryCode,
      relationship: relationship || "Family Member",
      status: "PENDING",
      method: "SMS",
      invitationToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  // Send SMS via AWS SNS
  try {
    const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "https://www.spokenodyssey.com";
    const invitationLink = `${frontendUrl}/family/join?token=${invitationToken}`;
    const inviterName = currentUser.displayName || currentUser.email?.split("@")[0] || "Someone";
    
    await sendInvitationSMS({
      phoneNumber: formatPhoneNumber(cleanCountryCode, cleanPhone),
      inviterName: inviterName,
      invitationLink: invitationLink,
      relationship: relationship || "Family Member"
    });
  } catch (smsError) {
    console.error("Failed to send SMS:", smsError);
    // Don't fail the invitation creation if SMS fails
    // The invitation is still valid and can be resent
  }

  return {
    message: `SMS invitation sent to ${cleanCountryCode}${cleanPhone}!`,
    invitation: newInvitation,
    receiver: targetUser ? await serializeUser(targetUser) : null,
    invitationToken
  };
};

/**
 * Create shareable link invitation
 */
const createLinkInvitation = async ({ currentUser, relationship }) => {
  // Get or create family circle for sender
  const familyCircle = await getOrCreateFamilyCircle({ currentUser });

  // Generate cryptographically secure random token
  const invitationToken = crypto.randomBytes(32).toString('hex');

  // Create invitation record with 7-day expiration
  const newInvitation = await prisma.familyInvitation.create({
    data: {
      familyCircleId: familyCircle.id,
      senderId: currentUser.id,
      relationship: relationship || "Family Member",
      status: "PENDING",
      method: "LINK",
      invitationToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  // Use production domain from env, fallback to spokenodyssey.com
  const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://www.spokenodyssey.com';
  const joinLink = `${frontendUrl}/invite/${invitationToken}`;

  return {
    message: "Shareable link created!",
    invitation: newInvitation,
    joinLink,
    invitationToken
  };
};

/**
 * Create QR code invitation
 */
const createQRInvitation = async ({ currentUser, relationship }) => {
  // Get or create family circle for sender
  const familyCircle = await getOrCreateFamilyCircle({ currentUser });

  // Generate cryptographically secure random token
  const invitationToken = crypto.randomBytes(32).toString('hex');

  // Create invitation record with 7-day expiration
  const newInvitation = await prisma.familyInvitation.create({
    data: {
      familyCircleId: familyCircle.id,
      senderId: currentUser.id,
      relationship: relationship || "Family Member",
      status: "PENDING",
      method: "QR",
      invitationToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  // Use production domain from env, fallback to spokenodyssey.com
  const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://www.spokenodyssey.com';
  const joinLink = `${frontendUrl}/invite/${invitationToken}`;

  // Generate QR code
  const qrCodeData = await generateInvitationQR({
    invitationToken,
    frontendUrl
  });

  return {
    message: "QR code invitation created!",
    invitation: newInvitation,
    joinLink,
    invitationToken,
    qrCode: qrCodeData.qrCode
  };
};

/**
 * Validate invitation token (for join via link/QR)
 */
const validateInvitationToken = async ({ token }) => {
  const invitation = await prisma.familyInvitation.findUnique({
    where: { invitationToken: token },
    include: { sender: true, familyCircle: true }
  });

  if (!invitation) {
    const error = new Error("Invalid invitation token");
    error.statusCode = 404;
    throw error;
  }

  // Check if expired
  if (invitation.expiresAt && new Date() > invitation.expiresAt) {
    await prisma.familyInvitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" }
    });
    const error = new Error("Invitation has expired");
    error.statusCode = 400;
    throw error;
  }

  if (invitation.status !== "PENDING") {
    const error = new Error(`Invitation is already ${invitation.status.toLowerCase()}`);
    error.statusCode = 400;
    throw error;
  }

  const sender = await serializeUser(invitation.sender);

  return {
    invitation: {
      id: invitation.id,
      familyCircleId: invitation.familyCircleId,
      familyCircleName: invitation.familyCircle.name,
      senderName: sender.name,
      senderAvatar: sender.avatar,
      relationship: invitation.relationship,
      method: invitation.method
    }
  };
};

/**
 * Accept invitation via token (for link/QR joins)
 */
const acceptInvitationViaToken = async ({ currentUser, token }) => {
  const invitation = await prisma.familyInvitation.findUnique({
    where: { invitationToken: token },
    include: { sender: true, familyCircle: true }
  });

  if (!invitation) {
    const error = new Error("Invalid invitation token");
    error.statusCode = 404;
    throw error;
  }

  // Check if expired
  if (invitation.expiresAt && new Date() > invitation.expiresAt) {
    await prisma.familyInvitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" }
    });
    const error = new Error("Invitation has expired");
    error.statusCode = 400;
    throw error;
  }

  if (invitation.status !== "PENDING") {
    const error = new Error(`Invitation is already ${invitation.status.toLowerCase()}`);
    error.statusCode = 400;
    throw error;
  }

  // Check if already a member
  const existingMember = await prisma.familyMember.findFirst({
    where: {
      familyCircleId: invitation.familyCircleId,
      userId: currentUser.id
    }
  });

  if (existingMember) {
    return {
      message: "You are already a member of this Family Circle!",
      alreadyMember: true
    };
  }

  // Check for duplicate pending request
  const existingPending = await prisma.familyInvitation.findFirst({
    where: {
      familyCircleId: invitation.familyCircleId,
      receiverId: currentUser.id,
      status: "ACCEPTED"
    }
  });

  if (existingPending) {
    return {
      message: "You already have a pending request for this Family Circle!",
      alreadyPending: true
    };
  }

  // Mark invitation as accepted (waiting for admin approval)
  await prisma.familyInvitation.update({
    where: { id: invitation.id },
    data: {
      status: "ACCEPTED",
      receiverId: currentUser.id,
      acceptedAt: new Date()
    }
  });

  // Create notification for admin about pending approval
  const receiverName = currentUser.displayName || currentUser.name || currentUser.email?.split("@")[0] || "Unknown";
  const senderName = invitation.sender.displayName || invitation.sender.email?.split("@")[0] || "Unknown";
  const familyCircleName = invitation.familyCircle.name;
  
  // Find the admin of the family circle
  const familyCircleWithAdmins = await prisma.familyCircle.findUnique({
    where: { id: invitation.familyCircleId },
    include: {
      members: {
        where: { role: "ADMIN" },
        include: { user: true }
      }
    }
  });

  // Send notification to all admins
  if (familyCircleWithAdmins && familyCircleWithAdmins.members.length > 0) {
    for (const adminMember of familyCircleWithAdmins.members) {
      await createNotification({
        userId: adminMember.user.id,
        type: "FAMILY_INVITE_ACCEPTED",
        title: "New Family Circle Join Request",
        message: `${receiverName} has accepted your invitation to join ${familyCircleName} as ${invitation.relationship}. Please review and approve this request.`,
        metadata: {
          invitationId: invitation.id,
          familyCircleId: invitation.familyCircleId,
          receiverId: currentUser.id,
          receiverName,
          senderId: invitation.senderId,
          relationship: invitation.relationship
        },
        actionUrl: `/family`
      });
    }
  } else {
    // If no admins found, notify the sender
    await createNotification({
      userId: invitation.senderId,
      type: "FAMILY_INVITE_ACCEPTED",
      title: "New Family Circle Join Request",
      message: `${receiverName} has accepted your invitation to join ${familyCircleName} as ${invitation.relationship}. Please review and approve this request.`,
      metadata: {
        invitationId: invitation.id,
        familyCircleId: invitation.familyCircleId,
        receiverId: currentUser.id,
        receiverName,
        relationship: invitation.relationship
      },
      actionUrl: `/family`
    });
  }

  return {
    message: "Invitation accepted! Waiting for admin approval to join the Family Circle.",
    invitation: {
      id: invitation.id,
      familyCircleName: invitation.familyCircle.name,
      senderName: invitation.sender.displayName || invitation.sender.email?.split("@")[0],
      relationship: invitation.relationship
    }
  };
};

const disconnectFamilyMember = async ({ currentUser, targetFirebaseUid }) => {
  const targetUser = await prisma.user.findUnique({
    where: { id: targetFirebaseUid }
  });
  if (!targetUser) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  // Disconnect bidirectionally
  const [u1, u2] = [currentUser.id, targetUser.id].sort();
  await prisma.familyConnection.deleteMany({
    where: {
      user1Id: u1,
      user2Id: u2
    }
  });

  return serializeUser(targetUser);
};

const followUser = async ({ user, targetUid }) => {
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUid }
  });
  if (!targetUser) {
    const error = new Error("Target user not found");
    error.statusCode = 404;
    throw error;
  }

  if (targetUid === user.id) {
    const error = new Error("You cannot follow yourself");
    error.statusCode = 400;
    throw error;
  }

  await prisma.follow.upsert({
    where: {
      followerId_followingId: {
        followerId: user.id,
        followingId: targetUid
      }
    },
    create: {
      followerId: user.id,
      followingId: targetUid
    },
    update: {}
  });

  return serializeUser(targetUser);
};

const unfollowUser = async ({ user, targetUid }) => {
  await prisma.follow.deleteMany({
    where: {
      followerId: user.id,
      followingId: targetUid
    }
  });

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUid }
  });
  return targetUser ? serializeUser(targetUser) : { id: targetUid };
};

const getFollowersList = async ({ user }) => {
  const follows = await prisma.follow.findMany({
    where: { followingId: user.id },
    include: { follower: true }
  });
  return Promise.all(follows.map(f => serializeUser(f.follower)));
};

const getFollowingList = async ({ user }) => {
  const follows = await prisma.follow.findMany({
    where: { followerId: user.id },
    include: { following: true }
  });
  return Promise.all(follows.map(f => serializeUser(f.following)));
};

const updateUserActiveStatus = async ({ currentUser }) => {
  if (!currentUser || (!currentUser.id && !currentUser.uid)) {
    return null;
  }
  const userId = currentUser.id || currentUser.uid;
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { lastActive: new Date() }
    });
    return user ? serializeUser(user) : null;
  } catch (err) {
    console.warn("Update user active status warning:", err.message);
    return null;
  }
};

const getUserById = async ({ currentUser, userId }) => {
  const currentUserId = currentUser?.id;
  const targetUser = await prisma.user.findFirst({
    where: {
      OR: [
        { id: userId },
        { googleId: userId },
        { email: userId ? userId.toLowerCase() : "" }
      ]
    },
    include: {
      _count: {
        select: {
          followers: true,
          following: true,
          memories: true,
          albums: true
        }
      },
      followers: currentUserId ? {
        where: { followerId: currentUserId }
      } : false
    }
  });

  if (!targetUser) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const serialized = await serializeUser(targetUser);

  const milestoneCount = await prisma.memory.count({
    where: {
      ownerId: targetUser.id,
      OR: [
        { type: { mode: "insensitive", contains: "milestone" } },
        { tags: { hasSome: ["milestone", "Milestone"] } }
      ]
    }
  });

  return {
    ...serialized,
    followersCount: targetUser._count?.followers || 0,
    followingCount: targetUser._count?.following || 0,
    memoriesCount: targetUser._count?.memories || 0,
    albumsCount: targetUser._count?.albums || 0,
    milestonesCount: milestoneCount,
    isFollowing: Array.isArray(targetUser.followers) && targetUser.followers.length > 0
  };
};

module.exports = {
  getSuggestedPeople,
  getFeaturedPeople,
  getFamilyMembers,
  sendFamilyInvitation,
  getPendingInvitations,
  acceptFamilyInvitation,
  declineFamilyInvitation,
  connectFamilyMember,
  disconnectFamilyMember,
  sendSMSInvitation,
  createLinkInvitation,
  createQRInvitation,
  validateInvitationToken,
  acceptInvitationViaToken,
  followUser,
  unfollowUser,
  getFollowersList,
  getFollowingList,
  updateUserActiveStatus,
  getUserById,
  serializeUser
};
