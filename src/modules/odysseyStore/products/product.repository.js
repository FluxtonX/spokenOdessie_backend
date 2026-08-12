const prisma = require("../../../config/prisma");

const findAll = async ({
  category,
  search,
  featured,
  minPrice,
  maxPrice,
  sort = "featured",
  page = 1,
  limit = 20,
  status = "ACTIVE",
} = {}) => {
  const where = {
    ...(status ? { status } : { status: "ACTIVE" }),
    ...(featured !== undefined ? { featured: Boolean(featured) } : {}),
    ...(category
      ? {
          category: {
            slug: category,
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { tagline: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(minPrice !== undefined || maxPrice !== undefined
      ? {
          basePrice: {
            ...(minPrice !== undefined ? { gte: parseFloat(minPrice) } : {}),
            ...(maxPrice !== undefined ? { lte: parseFloat(maxPrice) } : {}),
          },
        }
      : {}),
  };

  let orderBy = { createdAt: "desc" };
  if (sort === "price-asc") orderBy = { basePrice: "asc" };
  else if (sort === "price-desc") orderBy = { basePrice: "desc" };
  else if (sort === "rating") orderBy = { rating: "desc" };
  else if (sort === "featured") orderBy = [{ featured: "desc" }, { createdAt: "desc" }];

  const skip = (Math.max(1, page) - 1) * limit;

  const [products, total] = await Promise.all([
    prisma.storeProduct.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        category: true,
        variants: { where: { isActive: true } },
        options: { where: { isActive: true } },
        _count: {
          select: { reviews: true },
        },
      },
    }),
    prisma.storeProduct.count({ where }),
  ]);

  return {
    products,
    total,
    page: Math.max(1, page),
    totalPages: Math.ceil(total / limit) || 1,
  };
};

const findBySlugOrId = async (identifier) => {
  return prisma.storeProduct.findFirst({
    where: {
      OR: [{ slug: identifier }, { id: identifier }],
    },
    include: {
      category: true,
      variants: { where: { isActive: true } },
      options: { where: { isActive: true } },
      inventory: true,
      reviews: {
        where: { isApproved: true },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              photoURL: true,
            },
          },
        },
      },
      _count: {
        select: { reviews: true },
      },
    },
  });
};

const findById = async (id) => {
  return prisma.storeProduct.findUnique({
    where: { id },
    include: {
      category: true,
      variants: true,
      options: true,
      inventory: true,
    },
  });
};

const create = async (data) => {
  return prisma.storeProduct.create({ data });
};

const update = async (id, data) => {
  return prisma.storeProduct.update({
    where: { id },
    data,
  });
};

const deleteById = async (id) => {
  return prisma.storeProduct.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });
};

module.exports = {
  findAll,
  findBySlugOrId,
  findById,
  create,
  update,
  deleteById,
};
