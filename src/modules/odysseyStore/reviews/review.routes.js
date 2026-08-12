const express = require("express");
const controller = require("./review.controller");
const { protect } = require("../../../middlewares/auth.middleware");

const router = express.Router();

router.get("/product/:productId", controller.getProductReviews);
router.post("/product/:productId", protect, controller.submitReview);
router.delete("/:reviewId", protect, controller.deleteReview);

module.exports = router;
