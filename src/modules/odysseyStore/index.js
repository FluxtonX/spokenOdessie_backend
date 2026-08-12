const express = require("express");

const productRoutes = require("./products/product.routes");
const categoryRoutes = require("./categories/category.routes");
const cartRoutes = require("./cart/cart.routes");
const couponRoutes = require("./coupons/coupon.routes");
const inventoryRoutes = require("./inventory/inventory.routes");
const shippingRoutes = require("./shipping/shipping.routes");
const paymentRoutes = require("./payments/payment.routes");
const orderRoutes = require("./orders/order.routes");
const reviewRoutes = require("./reviews/review.routes");

const router = express.Router();

// Health check for the store domain
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Odyssey Store API is running",
    version: "1.0.0",
  });
});

router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/cart", cartRoutes);
router.use("/coupons", couponRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/shipping", shippingRoutes);
router.use("/payments", paymentRoutes);
router.use("/orders", orderRoutes);
router.use("/reviews", reviewRoutes);

module.exports = router;
