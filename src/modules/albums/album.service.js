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

const serializeAlbum = async (albumDoc) => {
  const album =
    typeof albumDoc.toObject === "function" ? albumDoc.toObject() : albumDoc;

  const memories = Array.isArray(album.memories)
    ? album.memories.map((memory) => ({ ...memory }))
    : [];

  return {
    id: album._id.toString(),
    title: album.title,
    subtitle: album.subtitle || "",
    entries: typeof album.entries === "number" ? album.entries : memories.length,
    coverImageKey: album.coverImageKey || null,
    coverImageUrl: await getSignedFileUrl(album.coverImageKey),
    ownerDisplayName: album.ownerDisplayName || "",
    ownerEmail: album.ownerEmail || "",
    memories,
    createdAt: album.createdAt,
    updatedAt: album.updatedAt,
  };
};

const getAlbumsByUser = async (user) => {
  const albums = await repository.findByOwnerFirebaseUid(user.uid);
  return Promise.all(albums.map((album) => serializeAlbum(album)));
};

const createAlbum = async ({ user, title, subtitle, file }) => {
  const normalizedTitle = title?.trim();
  const normalizedSubtitle = subtitle?.trim() || "";

  if (!normalizedTitle) {
    const error = new Error("Album title is required");
    error.statusCode = 400;
    throw error;
  }

  let coverImageKey = null;
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
    coverImageKey,
    entries: 0,
    memories: [],
  });

  const serializedAlbum = await serializeAlbum(album);

  if (coverUploadWarning) {
    serializedAlbum.coverUploadWarning = coverUploadWarning;
  }

  return serializedAlbum;
};

module.exports = {
  getAlbumsByUser,
  createAlbum,
};
