const prisma = require("../../config/prisma");

const findByOwnerFirebaseUid = (ownerId) =>
  prisma.album.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
  });

const findByOwnerAndPrivacy = (ownerId, allowedPrivacy) =>
  prisma.album.findMany({
    where: {
      ownerId,
      privacy: { in: allowedPrivacy },
    },
    orderBy: { createdAt: "desc" },
  });

const create = (payload) =>
  prisma.album.create({
    data: {
      ownerId: payload.ownerFirebaseUid,
      title: payload.title,
      subtitle: payload.subtitle || "",
      privacy: payload.privacy || "Private",
      coverImageKey: payload.coverImageKey || null,
      familyCircleId: payload.familyCircleId || null,
      entries: 0,
    },
  });

const findByIdAndOwnerFirebaseUid = (id, ownerId) =>
  prisma.album.findFirst({
    where: { id, ownerId },
  });

const addMemory = ({ albumId }) =>
  prisma.album.update({
    where: { id: albumId },
    data: {
      entries: { increment: 1 },
    },
  });

const removeMemory = ({ albumId }) =>
  prisma.album.update({
    where: { id: albumId },
    data: {
      entries: { decrement: 1 },
    },
  });

const updateMemory = () => {
  // No-op in PostgreSQL since relational mapping updates the memory record directly.
  return null;
};

module.exports = {
  findByOwnerFirebaseUid,
  findByOwnerAndPrivacy,
  create,
  findByIdAndOwnerFirebaseUid,
  addMemory,
  removeMemory,
  updateMemory,
};
