const prisma = require("../../config/prisma");

const findByOwnerFirebaseUid = (ownerId) =>
  prisma.memory.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
  });

const findByOwnerAndPrivacy = (ownerId, allowedPrivacy) =>
  prisma.memory.findMany({
    where: {
      ownerId,
      privacy: { in: allowedPrivacy },
    },
    orderBy: { updatedAt: "desc" },
  });

const findByIdAndOwnerFirebaseUid = (id, ownerId) =>
  prisma.memory.findFirst({
    where: { id, ownerId },
  });

const create = (payload) =>
  prisma.memory.create({
    data: {
      ownerId: payload.ownerFirebaseUid,
      title: payload.title,
      description: payload.description || "",
      tags: payload.tags || [],
      mood: payload.mood || "",
      privacy: payload.privacy || "Private",
      type: payload.type || "Text",
      status: payload.status || "draft",
      albumId: payload.albumId || null,
      occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
      color: payload.color || "",
      backgroundId: payload.backgroundId || "none",
      fontId: payload.fontId || "default",
      mediaKey: payload.mediaKey || null,
      thumbnailKey: payload.thumbnailKey || null,
      mediaOriginalName: payload.mediaOriginalName || "",
      mediaMimeType: payload.mediaMimeType || "",
      mediaList: payload.mediaList || [],
    },
  });

const updateByIdAndOwnerFirebaseUid = async (id, ownerId, payload) => {
  const exists = await prisma.memory.findFirst({ where: { id, ownerId } });
  if (!exists) return null;
  
  return prisma.memory.update({
    where: { id },
    data: payload,
  });
};

const deleteByIdAndOwnerFirebaseUid = async (id, ownerId) => {
  const exists = await prisma.memory.findFirst({ where: { id, ownerId } });
  if (!exists) return null;

  return prisma.memory.delete({
    where: { id },
  });
};

module.exports = {
  findByOwnerFirebaseUid,
  findByOwnerAndPrivacy,
  findByIdAndOwnerFirebaseUid,
  create,
  updateByIdAndOwnerFirebaseUid,
  deleteByIdAndOwnerFirebaseUid,
};
