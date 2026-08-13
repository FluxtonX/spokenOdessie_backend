const express = require("express");
const controller = require("./payment.controller");
const { protect } = require("../../../middlewares/auth.middleware");

const router = express.Router();

// Stripe webhook — raw body required
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  controller.handleWebhook
);

// Authenticated checkouts
// 1. Official Hosted Stripe Checkout Page (Redirect)
router.post("/create-checkout-session", protect, controller.createCheckoutSession);

// 2. Embedded PaymentIntent (Elements)
router.post("/create-intent", protect, controller.createCheckoutIntent);

// 3. Instant Payment & Session Verification (for success page or return from Stripe)
router.post("/verify-session", controller.verifySession);

module.exports = router;
