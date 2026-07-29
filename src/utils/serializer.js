const { getSignedFileUrl } = require("../services/s3.service");

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
    displayName: userDoc.displayName,
    email: userDoc.email,
    photoURL,
    photoKey: userDoc.photoKey,
    coverURL,
    coverKey: userDoc.coverKey,
    firebaseUid: userDoc.firebaseUid,
    createdAt: userDoc.createdAt,
    updatedAt: userDoc.updatedAt,
    isOnline: userDoc.lastActiveAt && new Date(userDoc.lastActiveAt) > threeMinutesAgo,
  };
};

module.exports = { serializeUser };
