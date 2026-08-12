const prisma = require("../../../config/prisma");

const findAll = async ({ activeOnly = true } = {}) => {
  return prisma.storeCategory.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: { order: "asc" },
    include: {
      _count: {
        select: { products: true },
      },
    },
  });
};

const findBySlug = async (slug) => {
  return prisma.storeCategory.findUnique({
    where: { slug },
    include: {
      products: {
        where: { status: "ACTIVE" },
        include: {
          variants: { where: { isActive: true } },
          options: { where: { isActive: true } },
        },
      },
    },
  });
};

const findById = async (id) => {
  return prisma.storeCategory.findUnique({
    where: { id },
  });
};

const create = async (data) => {
  return prisma.storeCategory.create({ data });
};

const update = async (id, data) => {
  return prisma.storeCategory.update({
    where: { id },
    data,
  });
};

const deleteById = async (id) => {
  return prisma.storeCategory.delete({
    where: { id },
  });
};

module.exports = {
  findAll,
  findBySlug,
  findById,
  create,
  update,
  deleteById,
};
