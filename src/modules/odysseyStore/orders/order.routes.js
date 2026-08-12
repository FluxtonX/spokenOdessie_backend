const express = require("express");
const controller = require("./order.controller");
const { protect } = require("../../../middlewares/auth.middleware");

const router = express.Router();

// All order routes require authentication
router.use(protect);

// User routes
router.get("/", controller.getMyOrders);
router.get("/:id", controller.getOrderById);
router.get("/:id/tracking", controller.getOrderTracking);

// Admin routes
router.patch("/:id/status", controller.updateOrderStatus);
router.get("/admin/all", controller.getAllOrders);

module.exports = router;
