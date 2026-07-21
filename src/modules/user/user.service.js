const prisma = require("../../config/prisma");
const { getSignedFileUrl } = require("../../services/s3.service");

const serializeUser = async (userDoc) => {
  if (!userDoc) return null;

  let photoURL = userDoc.photoURL || "";
  if (userDoc.photoKey) {
    try {
      photoURL = await getSignedFileUrl(userDoc.photoKey);
    } catch (err) {
      console.warn("Failed to get signed URL for user profile during user serialization:", err.message);
    }
  }

  let coverURL = userDoc.coverURL || "";
  if (userDoc.coverKey) {
    try {
      coverURL = await getSignedFileUrl(userDoc.coverKey);
    } catch (err) {
      console.warn("Failed to get signed URL for user cover during user serialization:", err.message);
    }
  } else if (!coverURL) {
    coverURL = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80";
  }

  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
  
  return {
    ...userDoc,
    id: userDoc.id,
    name: userDoc.displayName || userDoc.email?.split("@")[0] || "Alexander Mitchell",
    role: userDoc.profession || "Family Contributor",
    avatar: photoURL,
    photoURL,
    coverURL,
    bio: userDoc.bio || "",
    email: userDoc.email,
    location: userDoc.location || "Earth",
    isActive: userDoc.lastActive ? new Date(userDoc.lastActive) > threeMinutesAgo : false,
    firebaseUid: userDoc.id, // compatibility
    uid: userDoc.id,         // compatibility
  };
};

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

const sendFamilyInvitation = async ({ currentUser, email, firebaseUid, relationship }) => {
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

  // Check if already connected in FamilyConnection
  if (targetUser) {
    const [u1, u2] = [currentUser.id, targetUser.id].sort();
    const existingConn = await prisma.familyConnection.findUnique({
      where: {
        user1Id_user2Id: { user1Id: u1, user2Id: u2 }
      }
    });
    if (existingConn) {
      return {
        message: "Already connected in your Family Circle!",
        connected: true,
        user: await serializeUser(targetUser)
      };
    }
  }

  // Check if invitation already exists
  const existingInvite = await prisma.familyInvitation.findFirst({
    where: {
      senderId: currentUser.id,
      OR: [
        { email: cleanEmail || (targetUser ? targetUser.email : "") },
        targetUser ? { receiverId: targetUser.id } : {}
      ],
      status: "PENDING"
    }
  });

  if (existingInvite) {
    const updated = await prisma.familyInvitation.update({
      where: { id: existingInvite.id },
      data: { relationship: relationship || existingInvite.relationship }
    });
    return {
      message: "Invitation already sent! Updated relationship preferences.",
      invitation: updated
    };
  }

  // Create new invitation record
  const newInvitation = await prisma.familyInvitation.create({
    data: {
      senderId: currentUser.id,
      receiverId: targetUser ? targetUser.id : null,
      email: cleanEmail || (targetUser ? targetUser.email : ""),
      relationship: relationship || "Family Member",
      status: "PENDING"
    }
  });

  return {
    message: `Invitation successfully sent to ${targetUser?.displayName || cleanEmail}!`,
    invitation: newInvitation,
    receiver: targetUser ? await serializeUser(targetUser) : null
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
    include: { sender: true }
  });

  if (!invitation) {
    const error = new Error("Invitation not found");
    error.statusCode = 404;
    throw error;
  }

  // Verify authorization
  const isReceiver = invitation.receiverId === currentUser.id || invitation.email.toLowerCase() === currentUser.email.toLowerCase();
  if (!isReceiver) {
    const error = new Error("Not authorized to accept this invitation");
    error.statusCode = 403;
    throw error;
  }

  // Mark invitation as accepted
  await prisma.familyInvitation.update({
    where: { id: invitationId },
    data: {
      status: "ACCEPTED",
      receiverId: currentUser.id
    }
  });

  // Create bidirectional Family Connection
  const [u1, u2] = [invitation.senderId, currentUser.id].sort();
  await prisma.familyConnection.upsert({
    where: {
      user1Id_user2Id: { user1Id: u1, user2Id: u2 }
    },
    create: { user1Id: u1, user2Id: u2 },
    update: {}
  });

  return {
    message: "Invitation accepted! You are now connected in your Family Circle.",
    connectedUser: await serializeUser(invitation.sender)
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
  const user = await prisma.user.update({
    where: { id: currentUser.id },
    data: { lastActive: new Date() }
  });
  return user ? serializeUser(user) : null;
};

module.exports = {
  getSuggestedPeople,
  getFamilyMembers,
  sendFamilyInvitation,
  getPendingInvitations,
  acceptFamilyInvitation,
  declineFamilyInvitation,
  connectFamilyMember,
  disconnectFamilyMember,
  followUser,
  unfollowUser,
  getFollowersList,
  getFollowingList,
  updateUserActiveStatus,
  serializeUser
};
