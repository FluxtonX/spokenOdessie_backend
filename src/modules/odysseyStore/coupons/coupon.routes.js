const express = require("express");
const controller = require("./coupon.controller");
const { protect } = require("../../../middlewares/auth.middleware");

const router = express.Router();

router.post("/validate", controller.validateCoupon);

// Admin routes
router.get("/", protect, controller.getCoupons);
router.post("/", protect, controller.createCoupon);
router.put("/:id", protect, controller.updateCoupon);

module.exports = router;
