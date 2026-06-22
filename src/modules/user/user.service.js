const User = require("./user.model");
const { getSignedFileUrl } = require("../../services/s3.service");

const serializeUser = async (userDoc) => {
  let photoURL = userDoc.photoURL || "";
  if (userDoc.photoKey) {
    try {
      photoURL = await getSignedFileUrl(userDoc.photoKey);
    } catch (err) {
      console.warn("Failed to get signed URL for user profile during user serialization:", err.message);
    }
  }
  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
  return {
    id: userDoc.firebaseUid,
    name: userDoc.displayName || userDoc.email?.split("@")[0] || "Alexander Mitchell",
    role: userDoc.profession || "Family Contributor",
    avatar: photoURL,
    bio: userDoc.bio || "",
    email: userDoc.email,
    location: userDoc.location || "Earth",
    isActive: userDoc.lastActive ? new Date(userDoc.lastActive) > threeMinutesAgo : false
  };
};

const getSuggestedPeople = async ({ currentUser }) => {
  const currentUserDoc = await User.findOne({ firebaseUid: currentUser.uid });
  const connectedUids = currentUserDoc ? currentUserDoc.familyMembers || [] : [];

  const Follow = require("./follow.model");
  const followingLogs = await Follow.find({ followerId: currentUser.uid }).lean();
  const followedUids = followingLogs.map(f => f.followingId);

  // Suggest any user who is not current user and not connected/followed
  const excludedUids = [currentUser.uid, ...connectedUids, ...followedUids];

  const suggestedUsers = await User.find({
    firebaseUid: { $nin: excludedUids }
  }).limit(50);

  return Promise.all(suggestedUsers.map(u => serializeUser(u)));
};

const getFamilyMembers = async ({ currentUser }) => {
  const currentUserDoc = await User.findOne({ firebaseUid: currentUser.uid });
  if (!currentUserDoc) return [];

  const familyUids = currentUserDoc.familyMembers || [];
  if (!familyUids.length) return [];

  const familyUsers = await User.find({ firebaseUid: { $in: familyUids } });
  return Promise.all(familyUsers.map(u => serializeUser(u)));
};

const connectFamilyMember = async ({ currentUser, email, firebaseUid }) => {
  const query = {};
  if (firebaseUid) query.firebaseUid = firebaseUid;
  else if (email) query.email = email.trim().toLowerCase();
  else {
    const error = new Error("Email or Firebase UID is required");
    error.statusCode = 400;
    throw error;
  }

  const targetUser = await User.findOne(query);
  if (!targetUser) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  if (targetUser.firebaseUid === currentUser.uid) {
    const error = new Error("You cannot connect with yourself");
    error.statusCode = 400;
    throw error;
  }

  // Connect bidirectionally
  await User.findOneAndUpdate(
    { firebaseUid: currentUser.uid },
    { $addToSet: { familyMembers: targetUser.firebaseUid } }
  );

  await User.findOneAndUpdate(
    { firebaseUid: targetUser.firebaseUid },
    { $addToSet: { familyMembers: currentUser.uid } }
  );

  return serializeUser(targetUser);
};

const disconnectFamilyMember = async ({ currentUser, targetFirebaseUid }) => {
  const targetUser = await User.findOne({ firebaseUid: targetFirebaseUid });
  if (!targetUser) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  // Disconnect bidirectionally
  await User.findOneAndUpdate(
    { firebaseUid: currentUser.uid },
    { $pull: { familyMembers: targetFirebaseUid } }
  );

  await User.findOneAndUpdate(
    { firebaseUid: targetFirebaseUid },
    { $pull: { familyMembers: currentUser.uid } }
  );

  return serializeUser(targetUser);
};

const followUser = async ({ user, targetUid }) => {
  const targetUser = await User.findOne({ firebaseUid: targetUid });
  if (!targetUser) {
    const error = new Error("Target user not found");
    error.statusCode = 404;
    throw error;
  }

  if (targetUid === user.uid) {
    const error = new Error("You cannot follow yourself");
    error.statusCode = 400;
    throw error;
  }

  const Follow = require("./follow.model");
  await Follow.findOneAndUpdate(
    { followerId: user.uid, followingId: targetUid },
    {},
    { upsert: true, new: true }
  );

  return serializeUser(targetUser);
};

const unfollowUser = async ({ user, targetUid }) => {
  const Follow = require("./follow.model");
  await Follow.deleteOne({ followerId: user.uid, followingId: targetUid });

  const targetUser = await User.findOne({ firebaseUid: targetUid });
  return targetUser ? serializeUser(targetUser) : { id: targetUid };
};

const getFollowersList = async ({ user }) => {
  const Follow = require("./follow.model");
  const followLogs = await Follow.find({ followingId: user.uid }).lean();
  const followerUids = followLogs.map(f => f.followerId);

  if (!followerUids.length) return [];
  const followers = await User.find({ firebaseUid: { $in: followerUids } });
  return Promise.all(followers.map(f => serializeUser(f)));
};

const getFollowingList = async ({ user }) => {
  const Follow = require("./follow.model");
  const followLogs = await Follow.find({ followerId: user.uid }).lean();
  const followingUids = followLogs.map(f => f.followingId);

  if (!followingUids.length) return [];
  const following = await User.find({ firebaseUid: { $in: followingUids } });
  return Promise.all(following.map(f => serializeUser(f)));
};

const updateUserActiveStatus = async ({ currentUser }) => {
  const User = require("./user.model");
  const user = await User.findOneAndUpdate(
    { firebaseUid: currentUser.uid },
    { lastActive: new Date() },
    { new: true }
  );
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
  updateUserActiveStatus
};
