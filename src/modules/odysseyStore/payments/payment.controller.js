const paymentService = require("./payment.service");

const createCheckoutSession = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { couponCode, items, shippingAddress, customerEmail, customerName, customerPhone, successUrl, cancelUrl } = req.body;

    const result = await paymentService.createCheckoutSession({
      userId,
      couponCode,
      items,
      shippingAddress,
      customerEmail: customerEmail || req.user.email,
      customerName: customerName || req.user.displayName || req.user.fullName,
      customerPhone,
      successUrl,
      cancelUrl,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const createCheckoutIntent = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { couponCode, shippingAddress, customerEmail, customerName, customerPhone } = req.body;

    const result = await paymentService.createCheckoutIntent({
      userId,
      couponCode,
      shippingAddress,
      customerEmail: customerEmail || req.user.email,
      customerName: customerName || req.user.displayName || req.user.fullName,
      customerPhone,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Handle raw Stripe webhook events.
 */
const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers["stripe-signature"];
    const payload = req.rawBody || req.body;
    const result = await paymentService.handleWebhook(payload, signature);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const verifySession = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { sessionId, orderId } = req.body;
    const order = await paymentService.verifySession({ sessionId, orderId, userId });
    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCheckoutSession,
  createCheckoutIntent,
  verifySession,
  handleWebhook,
};
