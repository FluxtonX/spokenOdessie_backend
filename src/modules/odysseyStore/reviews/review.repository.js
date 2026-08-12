const prisma = require("../../../config/prisma");

const findByProductId = async ({ productId, page = 1, limit = 10, approvedOnly = true }) => {
  const skip = (Math.max(1, page) - 1) * limit;

  const [reviews, total] = await Promise.all([
    prisma.storeReview.findMany({
      where: {
        productId,
        ...(approvedOnly ? { isApproved: true } : {}),
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        user: {
          select: { id: true, displayName: true, photoURL: true },
        },
      },
    }),
    prisma.storeReview.count({
      where: { productId, ...(approvedOnly ? { isApproved: true } : {}) },
    }),
  ]);

  // Compute rating distribution
  const ratingAgg = await prisma.storeReview.aggregate({
    where: { productId, isApproved: true },
    _avg: { rating: true },
    _count: { rating: true },
  });

  return {
    reviews,
    total,
    page: Math.max(1, page),
    totalPages: Math.ceil(total / limit) || 1,
    averageRating: ratingAgg._avg.rating || 0,
    reviewCount: ratingAgg._count.rating || 0,
  };
};

const findByUserAndProduct = async ({ userId, productId }) => {
  return prisma.storeReview.findFirst({
    where: { userId, productId },
  });
};

const create = async (data) => {
  const review = await prisma.storeReview.create({ data });

  // Update product aggregate rating
  const agg = await prisma.storeReview.aggregate({
    where: { productId: data.productId, isApproved: true },
    _avg: { rating: true },
    _count: { rating: true },
  });

  await prisma.storeProduct.update({
    where: { id: data.productId },
    data: {
      rating: agg._avg.rating || data.rating,
      reviewsCount: agg._count.rating || 1,
    },
  });

  return review;
};

const deleteById = async (id) => {
  return prisma.storeReview.delete({ where: { id } });
};

module.exports = {
  findByProductId,
  findByUserAndProduct,
  create,
  deleteById,
};
