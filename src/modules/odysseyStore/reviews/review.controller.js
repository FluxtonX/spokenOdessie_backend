const reviewService = require("./review.service");

const getProductReviews = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const result = await reviewService.getProductReviews({ productId, page, limit });
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const submitReview = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;
    const { rating, title, comment } = req.body;
    const review = await reviewService.submitReview({ userId, productId, rating, title, comment });
    res.status(201).json({
      success: true,
      data: review,
    });
  } catch (error) {
    next(error);
  }
};

const deleteReview = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const reviewId = req.params.reviewId;
    await reviewService.deleteReview({ reviewId, userId });
    res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProductReviews,
  submitReview,
  deleteReview,
};
