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

const connectFamilyMember = async ({ currentUser, email, firebaseUid }) => {
  const query = {};
  if (firebaseUid) query.id = firebaseUid;
  else if (email) query.email = email.trim().toLowerCase();
  else {
    const error = new Error("Email or User ID is required");
    error.statusCode = 400;
    throw error;
  }

  const targetUser = await prisma.user.findFirst({ where: query });
  if (!targetUser) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  if (targetUser.id === currentUser.id) {
    const error = new Error("You cannot connect with yourself");
    error.statusCode = 400;
    throw error;
  }

  // Connect bidirectionally
  const [u1, u2] = [currentUser.id, targetUser.id].sort();
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
  });

  return serializeUser(targetUser);
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
  const user = await prisma.user.update({
    where: { id: currentUser.id },
    data: { lastActive: new Date() }
  });
  return user ? serializeUser(user) : null;
};

module.exports = {
  getSuggestedPeople,
  getFamilyMembers,
  connectFamilyMember,
  disconnectFamilyMember,
  followUser,
  unfollowUser,
  getFollowersList,
  getFollowingList,
  updateUserActiveStatus,
  serializeUser
};
