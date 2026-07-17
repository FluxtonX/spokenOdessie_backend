const repository = require("./album.repository");
const prisma = require("../../config/prisma");
const { uploadImageToS3, getSignedFileUrl } = require("../../services/s3.service");

const getOwnerDisplayName = (user) => {
  if (user.displayName && user.displayName.trim()) {
    return user.displayName.trim();
  }

  if (user.email) {
    return user.email.split("@")[0];
  }

  return "Spoken Odyssey User";
};

const serializeAlbum = async (album, currentUser) => {
  if (!album) return null;

  // Determine relationship
  const isOwner = currentUser && album.ownerId === currentUser.id;
  let isFamily = false;
  
  if (currentUser && !isOwner) {
    const [u1, u2] = [currentUser.id, album.ownerId].sort();
    const familyConnection = await prisma.familyConnection.findUnique({
      where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } }
    });
    isFamily = !!familyConnection;
  }

  // Fetch memories associated with this album dynamically
  let memories = await prisma.memory.findMany({
    where: { albumId: album.id }
  });

  // Filter memories based on privacy relationship
  if (!isOwner) {
    memories = memories.filter((memory) => {
      const memoryPrivacy = memory.privacy || "Private";
      if (memoryPrivacy === "Public") return true;
      if (memoryPrivacy === "Family" || memoryPrivacy === "Family Circle") {
        return isFamily;
      }
      return false; // Hide Private memories from non-owners
    });
  }

  const mappedMemories = await Promise.all(
    memories.map(async (memory) => {
      // Resolve media list URLs if present
      let mediaListWithUrls = [];
      if (memory.mediaList) {
        let parsedMedia = [];
        try {
          parsedMedia = typeof memory.mediaList === "string" ? JSON.parse(memory.mediaList) : memory.mediaList;
        } catch (_) {}
        if (Array.isArray(parsedMedia)) {
          mediaListWithUrls = await Promise.all(
            parsedMedia.map(async (item) => ({
              ...item,
              mediaUrl: await getSignedFileUrl(item.mediaKey),
              thumbnailUrl: await getSignedFileUrl(item.thumbnailKey),
            }))
          );
        }
      }

      return {
        ...memory,
        mediaUrl: await getSignedFileUrl(memory.mediaKey),
        thumbnailUrl: await getSignedFileUrl(memory.thumbnailKey),
        mediaList: mediaListWithUrls,
        id: memory.id,
      };
    })
  );

  return {
    id: album.id,
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
    ownerFirebaseUid: album.ownerId, // compatibility
    ownerId: album.ownerId,
  };
};

const getAlbumsByUser = async (currentUser, targetUserId) => {
  const targetUid = targetUserId || currentUser.id;

  if (targetUid === currentUser.id) {
    const albums = await repository.findByOwnerFirebaseUid(currentUser.id);
    return Promise.all(albums.map((album) => serializeAlbum(album, currentUser)));
  }

  const [u1, u2] = [currentUser.id, targetUid].sort();
  const familyConnection = await prisma.familyConnection.findUnique({
    where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } }
  });
  const isFamily = !!familyConnection;

  // Get all albums of target user and serialize them with privacy filtering
  const albums = await repository.findByOwnerFirebaseUid(targetUid);
  const serialized = await Promise.all(albums.map((album) => serializeAlbum(album, currentUser)));

  // Filter albums that are visible to the requester
  return serialized.filter((album) => {
    const albumPrivacy = album.privacy || "Private";
    if (albumPrivacy === "Public") return true;
    if (albumPrivacy === "Family" && isFamily) return true;
    
    // Private/Family album where user isn't family: only show if the album contains at least one memory visible to them
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
        folder: `albums/${user.id}`,
      });
      coverImageKey = upload.key;
    } catch (error) {
      coverUploadWarning =
        error.message ||
        "Album was saved, but the cover image could not be uploaded.";
      console.error("Album cover upload warning:", coverUploadWarning);
    }
  }

  // Retrieve user email/display name for caching
  const userDoc = await prisma.user.findUnique({ where: { id: user.id } });

  const album = await repository.create({
    ownerFirebaseUid: user.id,
    ownerDisplayName: getOwnerDisplayName(userDoc || user),
    ownerEmail: user.email || userDoc?.email || "",
    title: normalizedTitle,
    subtitle: normalizedSubtitle,
    privacy: normalizedPrivacy,
    coverImageKey,
  });

  // Attach display fields manually since we just created it
  const albumData = {
    ...album,
    ownerDisplayName: getOwnerDisplayName(userDoc || user),
    ownerEmail: user.email || userDoc?.email || "",
  };

  const serializedAlbum = await serializeAlbum(albumData, user);

  if (coverUploadWarning) {
    serializedAlbum.coverUploadWarning = coverUploadWarning;
  }

  return serializedAlbum;
};

const updateAlbum = async ({ user, albumId, title, subtitle, privacy, coverUrl, file }) => {
  const album = await repository.findByIdAndOwnerFirebaseUid(albumId, user.id);

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
        folder: `albums/${user.id}`,
      });
      coverImageKey = upload.key;
    } catch (error) {
      coverUploadWarning =
        error.message ||
        "Album was updated, but the new cover image could not be uploaded.";
      console.error("Album cover upload warning:", coverUploadWarning);
    }
  }

  const userDoc = await prisma.user.findUnique({ where: { id: user.id } });

  const updated = await prisma.album.update({
    where: { id: albumId },
    data: {
      title: normalizedTitle,
      subtitle: normalizedSubtitle,
      privacy: normalizedPrivacy,
      coverImageKey: coverImageKey,
    }
  });

  const albumData = {
    ...updated,
    ownerDisplayName: getOwnerDisplayName(userDoc || user),
    ownerEmail: user.email || userDoc?.email || "",
  };

  const serializedAlbum = await serializeAlbum(albumData, user);

  if (coverUploadWarning) {
    serializedAlbum.coverUploadWarning = coverUploadWarning;
  }

  return serializedAlbum;
};

const getAlbumDetails = async ({ currentUser, albumId }) => {
  const album = await prisma.album.findUnique({
    where: { id: albumId }
  });
  if (!album) {
    const error = new Error("Album could not be found.");
    error.statusCode = 404;
    throw error;
  }

  const userDoc = await prisma.user.findUnique({ where: { id: album.ownerId } });
  const albumData = {
    ...album,
    ownerDisplayName: getOwnerDisplayName(userDoc),
    ownerEmail: userDoc?.email || "",
  };

  const serialized = await serializeAlbum(albumData, currentUser);

  // Check ownership
  const isOwner = album.ownerId === currentUser.id;
  if (isOwner) return serialized;

  const [u1, u2] = [currentUser.id, album.ownerId].sort();
  const familyConnection = await prisma.familyConnection.findUnique({
    where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } }
  });
  const isFamily = !!familyConnection;

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
