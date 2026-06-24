const repository = require("./album.repository");
const { uploadImageToS3, getSignedFileUrl } = require("../../services/s3.service");

const getOwnerDisplayName = (user) => {
  if (user.name && user.name.trim()) {
    return user.name.trim();
  }

  if (user.email) {
    return user.email.split("@")[0];
  }

  return "Spoken Odyssey User";
};

const serializeAlbum = async (albumDoc, currentUser) => {
  const album =
    typeof albumDoc.toObject === "function" ? albumDoc.toObject() : albumDoc;

  // Determine relationship
  const isOwner = currentUser && album.ownerFirebaseUid === currentUser.uid;
  let isFamily = false;
  if (currentUser && !isOwner) {
    const User = require("../user/user.model");
    const owner = await User.findOne({ firebaseUid: album.ownerFirebaseUid });
    isFamily = owner?.familyMembers?.includes(currentUser.uid) || false;
  }

  // Filter memories based on relationship
  let memories = Array.isArray(album.memories) ? album.memories : [];
  if (!isOwner) {
    memories = memories.filter((memory) => {
      const memoryPrivacy = memory.privacy || "Private";
      if (memoryPrivacy === "Public") return true;
      if (memoryPrivacy === "Family" || memoryPrivacy === "Family Circle") {
        return isFamily;
      }
      return false; // Hide Private memories from everyone else
    });
  }

  const mappedMemories = await Promise.all(
    memories.map(async (memory) => ({
      ...memory,
      mediaUrl: await getSignedFileUrl(memory.mediaKey),
      thumbnailUrl: await getSignedFileUrl(memory.thumbnailKey),
    }))
  );

  return {
    id: album._id.toString(),
    title: album.title,
    subtitle: album.subtitle || "",
    privacy: album.privacy || "Private",
    entries: mappedMemories.length,
    coverImageKey: album.coverImageKey || null,
    coverImageUrl: await getSignedFileUrl(album.coverImageKey),
    ownerDisplayName: album.ownerDisplayName || "",
    ownerEmail: album.ownerEmail || "",
    memories: mappedMemories,
    createdAt: album.createdAt,
    updatedAt: album.updatedAt,
  };
};

const getAlbumsByUser = async (currentUser, targetUserId) => {
  const targetUid = targetUserId || currentUser.uid;

  if (targetUid === currentUser.uid) {
    const albums = await repository.findByOwnerFirebaseUid(currentUser.uid);
    return Promise.all(albums.map((album) => serializeAlbum(album, currentUser)));
  }

  const User = require("../user/user.model");
  const targetUser = await User.findOne({ firebaseUid: targetUid });
  const isFamily = targetUser?.familyMembers?.includes(currentUser.uid) || false;

  // Get all albums of target user and serialize them with privacy filtering applied
  const albums = await repository.findByOwnerFirebaseUid(targetUid);
  const serialized = await Promise.all(albums.map((album) => serializeAlbum(album, currentUser)));

  // Filter albums that are visible to the requester
  return serialized.filter((album) => {
    const albumPrivacy = album.privacy || "Private";
    if (albumPrivacy === "Public") return true;
    if (albumPrivacy === "Family" && isFamily) return true;
    
    // Private album or family album where user isn't family:
    // Only show if the album has at least one memory visible to them!
    if (album.memories.length > 0) return true;

    return false;
  });
};

const createAlbum = async ({ user, title, subtitle, privacy, coverUrl, file }) => {
  const normalizedTitle = title?.trim();
  const normalizedSubtitle = subtitle?.trim() || "";
  const normalizedPrivacy = privacy?.trim() || "Private";

  if (!normalizedTitle) {
    const error = new Error("Album title is required");
    error.statusCode = 400;
    throw error;
  }

  let coverImageKey = coverUrl || null;
  let coverUploadWarning = null;

  if (file) {
    try {
      const upload = await uploadImageToS3({
        file,
        folder: `albums/${user.uid}`,
      });
      coverImageKey = upload.key;
    } catch (error) {
      coverUploadWarning =
        error.message ||
        "Album was saved, but the cover image could not be uploaded.";
      console.error("Album cover upload warning:", coverUploadWarning);
    }
  }

  const album = await repository.create({
    ownerFirebaseUid: user.uid,
    ownerDisplayName: getOwnerDisplayName(user),
    ownerEmail: user.email || "",
    title: normalizedTitle,
    subtitle: normalizedSubtitle,
    privacy: normalizedPrivacy,
    coverImageKey,
    entries: 0,
    memories: [],
  });

  const serializedAlbum = await serializeAlbum(album, user);

  if (coverUploadWarning) {
    serializedAlbum.coverUploadWarning = coverUploadWarning;
  }

  return serializedAlbum;
};

const updateAlbum = async ({ user, albumId, title, subtitle, privacy, coverUrl, file }) => {
  const album = await repository.findByIdAndOwnerFirebaseUid(albumId, user.uid);

  if (!album) {
    const error = new Error("Album could not be found.");
    error.statusCode = 404;
    throw error;
  }

  const normalizedTitle = typeof title === "string" ? title.trim() : album.title;
  const normalizedSubtitle = typeof subtitle === "string" ? subtitle.trim() : album.subtitle;
  const normalizedPrivacy = typeof privacy === "string" ? privacy.trim() : album.privacy;

  if (!normalizedTitle) {
    const error = new Error("Album title is required");
    error.statusCode = 400;
    throw error;
  }

  let coverImageKey = coverUrl || album.coverImageKey;
  let coverUploadWarning = null;

  if (file) {
    try {
      const upload = await uploadImageToS3({
        file,
        folder: `albums/${user.uid}`,
      });
      coverImageKey = upload.key;
    } catch (error) {
      coverUploadWarning =
        error.message ||
        "Album was updated, but the new cover image could not be uploaded.";
      console.error("Album cover upload warning:", coverUploadWarning);
    }
  }

  album.title = normalizedTitle;
  album.subtitle = normalizedSubtitle;
  album.privacy = normalizedPrivacy;
  album.coverImageKey = coverImageKey;

  await album.save();

  const serializedAlbum = await serializeAlbum(album, user);

  if (coverUploadWarning) {
    serializedAlbum.coverUploadWarning = coverUploadWarning;
  }

  return serializedAlbum;
};

const getAlbumDetails = async ({ currentUser, albumId }) => {
  const Album = require("./album.model");
  const album = await Album.findById(albumId);
  if (!album) {
    const error = new Error("Album could not be found.");
    error.statusCode = 404;
    throw error;
  }

  const serialized = await serializeAlbum(album, currentUser);

  // Check ownership
  const isOwner = album.ownerFirebaseUid === currentUser.uid;
  if (isOwner) return serialized;

  const User = require("../user/user.model");
  const owner = await User.findOne({ firebaseUid: album.ownerFirebaseUid });
  const isFamily = owner?.familyMembers?.includes(currentUser.uid) || false;

  const albumPrivacy = album.privacy || "Private";
  const hasVisibleMemories = serialized.memories.length > 0;

  if (albumPrivacy === "Public") return serialized;
  if (albumPrivacy === "Family" && isFamily) return serialized;
  if (hasVisibleMemories) return serialized;

  const error = new Error("Access denied. Album permissions required.");
  error.statusCode = 403;
  throw error;
};

module.exports = {
  serializeAlbum,
  getAlbumsByUser,
  createAlbum,
  updateAlbum,
  getAlbumDetails,
};
