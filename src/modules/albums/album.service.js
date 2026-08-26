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
    // 1. Check if album belongs to a Family Circle where currentUser is a member
    if (album.familyCircleId) {
      const circleMem = await prisma.familyMember.findFirst({
        where: { familyCircleId: album.familyCircleId, userId: currentUser.id }
      });
      if (circleMem) isFamily = true;
    }

    // 2. Check if currentUser & album owner share any Family Circle
    if (!isFamily) {
      const myCircles = await prisma.familyMember.findMany({
        where: { userId: currentUser.id },
        select: { familyCircleId: true }
      });
      const myCircleIds = myCircles.map((c) => c.familyCircleId);

      if (myCircleIds.length > 0) {
        const ownerInCircle = await prisma.familyMember.findFirst({
          where: { userId: album.ownerId, familyCircleId: { in: myCircleIds } }
        });
        if (ownerInCircle) isFamily = true;
      }
    }

    // 3. Fallback to 1:1 familyConnection junction
    if (!isFamily) {
      const [u1, u2] = [currentUser.id, album.ownerId].sort();
      const familyConnection = await prisma.familyConnection.findUnique({
        where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } }
      });
      isFamily = !!familyConnection;
    }
  }

  // Fetch memories associated with this album dynamically
  let memories = await prisma.memory.findMany({
    where: { albumId: album.id },
    include: { owner: true }
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

  const memoryService = require("../memories/memory.service");
  const mappedMemories = await Promise.all(
    memories.map(async (memory) => {
      const serialized = await memoryService.serializeMemory(memory, currentUser);
      return serialized;
    })
  );

  // Fetch contributors for multi-contributor family albums
  const dbContributors = await prisma.albumContributor.findMany({
    where: { albumId: album.id },
    include: { user: true }
  });

  const contributors = await Promise.all(
    dbContributors.map(async (c) => {
      const u = c.user;
      const memCount = memories.filter((m) => m.ownerId === c.userId).length;
      let avatarUrl = u.photoURL || u.avatarUrl || u.avatar || null;
      if (!avatarUrl && u.photoKey) {
        avatarUrl = await getSignedFileUrl(u.photoKey).catch(() => null);
      }
      return {
        userId: c.userId,
        name: getOwnerDisplayName(u),
        email: u.email,
        avatar: avatarUrl,
        role: c.role,
        memoryCount: memCount,
        joinedAt: c.joinedAt
      };
    })
  );

  // Fallback to owner if no dbContributors recorded yet
  if (contributors.length === 0 && album.ownerId) {
    const ownerDoc = await prisma.user.findUnique({ where: { id: album.ownerId } });
    if (ownerDoc) {
      let avatarUrl = ownerDoc.photoURL || ownerDoc.avatarUrl || ownerDoc.avatar || null;
      if (!avatarUrl && ownerDoc.photoKey) {
        avatarUrl = await getSignedFileUrl(ownerDoc.photoKey).catch(() => null);
      }
      contributors.push({
        userId: album.ownerId,
        name: getOwnerDisplayName(ownerDoc),
        email: ownerDoc.email,
        avatar: avatarUrl,
        role: "CREATOR",
        memoryCount: mappedMemories.length,
        joinedAt: album.createdAt
      });
    }
  }

  return {
    id: album.id,
    title: album.title,
    subtitle: album.subtitle || "",
    privacy: album.privacy || "Private",
    familyCircleId: album.familyCircleId || null,
    entries: mappedMemories.length,
    memoryCount: mappedMemories.length,
    coverImageKey: album.coverImageKey || null,
    coverImageUrl: await getSignedFileUrl(album.coverImageKey),
    ownerDisplayName: album.ownerDisplayName || "",
    ownerEmail: album.ownerEmail || "",
    contributors,
    isContributor: contributors.some((c) => c.userId === currentUser?.id),
    memories: mappedMemories,
    createdAt: album.createdAt,
    updatedAt: album.updatedAt,
    ownerFirebaseUid: album.ownerId, // compatibility
    ownerId: album.ownerId,
  };
};

const getAlbumsByUser = async (currentUser, targetUserId) => {
  const currentUserId = currentUser?.id || currentUser?.uid || currentUser?.sub;
  const targetUid = targetUserId || currentUserId;

  if (!targetUid) {
    return [];
  }

  if (currentUserId && targetUid === currentUserId) {
    const albums = await repository.findByOwnerFirebaseUid(currentUserId);
    return Promise.all(albums.map((album) => serializeAlbum(album, currentUser)));
  }

  let isFamily = false;
  if (currentUserId && targetUid) {
    try {
      const [u1, u2] = [currentUserId, targetUid].sort();
      const familyConnection = await prisma.familyConnection.findUnique({
        where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } }
      });
      isFamily = !!familyConnection;
    } catch (_) {}
  }

  // Get all albums of target user and serialize them with privacy filtering
  const albums = await repository.findByOwnerFirebaseUid(targetUid);
  const serialized = await Promise.all(albums.map((album) => serializeAlbum(album, currentUser)));

  // Filter albums that are visible to the requester
  return serialized.filter((album) => {
    if (!album) return false;
    const albumPrivacy = album.privacy || "Private";
    if (albumPrivacy === "Public" || albumPrivacy === "public" || albumPrivacy === "Everyone") return true;
    if ((albumPrivacy === "Family" || albumPrivacy === "Family Circle") && isFamily) return true;
    
    // Private/Family album where user isn't family: only show if the album contains at least one memory visible to them
    if (Array.isArray(album.memories) && album.memories.length > 0) return true;

    return false;
  });
};

const createAlbum = async ({ user, title, subtitle, privacy, familyCircleId, coverUrl, file }) => {
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
    familyCircleId: familyCircleId || null,
    coverImageKey,
  });

  // Automatically register creator as CREATOR in AlbumContributor
  await prisma.albumContributor.create({
    data: {
      albumId: album.id,
      userId: user.id,
      role: "CREATOR"
    }
  }).catch(() => null);

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

const updateAlbum = async ({ user, albumId, title, subtitle, privacy, familyCircleId, coverUrl, file }) => {
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
      familyCircleId: familyCircleId !== undefined ? familyCircleId : album.familyCircleId,
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

  // If album is bound to a Family Circle, verify current user's membership
  if (album.familyCircleId) {
    const isMember = await prisma.familyMember.findFirst({
      where: { familyCircleId: album.familyCircleId, userId: currentUser.id }
    });
    if (isMember) return serialized;
  }

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

const addMemoryToAlbum = async ({ currentUser, albumId, memoryId }) => {
  const album = await prisma.album.findUnique({ where: { id: albumId } });
  if (!album) {
    const error = new Error("Album not found.");
    error.statusCode = 404;
    throw error;
  }

  const memory = await prisma.memory.findUnique({ where: { id: memoryId } });
  if (!memory) {
    const error = new Error("Memory not found.");
    error.statusCode = 404;
    throw error;
  }

  // Permissions check:
  if (album.privacy === "Private" && album.ownerId !== currentUser.id) {
    const error = new Error("Access denied. Cannot contribute to a private album.");
    error.statusCode = 403;
    throw error;
  }

  // If album has familyCircleId, verify membership or ownership
  if (album.familyCircleId) {
    const isOwnerOrCreator = album.ownerId === currentUser.id;
    if (!isOwnerOrCreator) {
      const membership = await prisma.familyMember.findFirst({
        where: { familyCircleId: album.familyCircleId, userId: currentUser.id }
      });
      if (!membership) {
        const error = new Error("Access denied. Must be a member of the Family Space to contribute.");
        error.statusCode = 403;
        throw error;
      }
    }
  }

  // Link memory to album via relation and update privacy to Family if inside Family Space
  await prisma.memory.update({
    where: { id: memoryId },
    data: {
      album: { connect: { id: albumId } },
      ...(album.familyCircleId ? { privacy: "Family" } : {})
    }
  });

  // If album is bound to a Family Space, also create FamilyMemoryLink so it shows in Family Shared Memories
  if (album.familyCircleId) {
    await prisma.familyMemoryLink.upsert({
      where: {
        familyCircleId_memoryId: {
          familyCircleId: album.familyCircleId,
          memoryId
        }
      },
      create: {
        familyCircleId: album.familyCircleId,
        memoryId,
        linkedById: currentUser.id,
        occurredAt: memory.occurredAt || new Date()
      },
      update: {}
    }).catch(() => null);
  }

  // Upsert AlbumContributor record for currentUser
  await prisma.albumContributor.upsert({
    where: { albumId_userId: { albumId, userId: currentUser.id } },
    create: { albumId, userId: currentUser.id, role: "CONTRIBUTOR" },
    update: {}
  });

  // Recalculate entries count
  const updatedCount = await prisma.memory.count({ where: { albumId } });
  await prisma.album.update({
    where: { id: albumId },
    data: { entries: updatedCount }
  });

  return serializeAlbum(album, currentUser);
};

const getFamilyCircleAlbums = async ({ currentUser, familyCircleId }) => {
  const membership = await prisma.familyMember.findFirst({
    where: { familyCircleId, userId: currentUser.id }
  });
  if (!membership) {
    const error = new Error("Access denied. Must be a member of the Family Space.");
    error.statusCode = 403;
    throw error;
  }

  const albums = await prisma.album.findMany({
    where: { familyCircleId },
    orderBy: { createdAt: "desc" }
  });

  return Promise.all(albums.map((a) => serializeAlbum(a, currentUser)));
};

const deleteAlbum = async ({ user, albumId }) => {
  const album = await repository.findByIdAndOwnerFirebaseUid(albumId, user.id);

  if (!album) {
    const error = new Error("Album could not be found.");
    error.statusCode = 404;
    throw error;
  }

  // Delete the album
  await prisma.album.delete({
    where: { id: albumId }
  });

  return { success: true, message: "Album deleted successfully" };
};

module.exports = {
  serializeAlbum,
  getAlbumsByUser,
  createAlbum,
  updateAlbum,
  getAlbumDetails,
  addMemoryToAlbum,
  getFamilyCircleAlbums,
  deleteAlbum,
};
