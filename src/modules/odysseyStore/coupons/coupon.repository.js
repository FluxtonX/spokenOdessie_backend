const prisma = require("../../../config/prisma");

const findByCode = async (code) => {
  return prisma.storeCoupon.findUnique({
    where: { code: code.toUpperCase().trim() },
  });
};

const findAll = async () => {
  return prisma.storeCoupon.findMany({
    orderBy: { createdAt: "desc" },
  });
};

const create = async (data) => {
  return prisma.storeCoupon.create({
    data: {
      ...data,
      code: data.code.toUpperCase().trim(),
    },
  });
};

const update = async (id, data) => {
  return prisma.storeCoupon.update({
    where: { id },
    data,
  });
};

const incrementUsage = async (id) => {
  return prisma.storeCoupon.update({
    where: { id },
    data: { usedCount: { increment: 1 } },
  });
};

module.exports = {
  findByCode,
  findAll,
  create,
  update,
  incrementUsage,
};
