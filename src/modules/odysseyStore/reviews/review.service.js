const reviewRepository = require("./review.repository");
const prisma = require("../../../config/prisma");

const getProductReviews = async ({ productId, page, limit }) => {
  return reviewRepository.findByProductId({ productId, page, limit });
};

const submitReview = async ({ userId, productId, rating, title, comment }) => {
  // Prevent duplicate reviews from same user
  const existing = await reviewRepository.findByUserAndProduct({ userId, productId });
  if (existing) {
    const err = new Error("You have already reviewed this product");
    err.statusCode = 400;
    throw err;
  }

  // Check if the user is a verified buyer (has a delivered order containing this product)
  const verifiedOrder = await prisma.storeOrderItem.findFirst({
    where: {
      productId,
      order: {
        userId,
        status: "DELIVERED",
      },
    },
  });

  return reviewRepository.create({
    userId,
    productId,
    rating: Math.min(5, Math.max(1, parseInt(rating, 10))),
    title: title?.trim() || null,
    comment: comment.trim(),
    verifiedPurchase: !!verifiedOrder,
    isApproved: true,
  });
};

const deleteReview = async ({ reviewId, userId }) => {
  const review = await prisma.storeReview.findUnique({ where: { id: reviewId } });
  if (!review) {
    const err = new Error("Review not found");
    err.statusCode = 404;
    throw err;
  }
  if (review.userId !== userId) {
    const err = new Error("You can only delete your own reviews");
    err.statusCode = 403;
    throw err;
  }
  return reviewRepository.deleteById(reviewId);
};

module.exports = {
  getProductReviews,
  submitReview,
  deleteReview,
};
