const shippingService = require("./shipping.service");

const calculateShipping = async (req, res, next) => {
  try {
    const { items, subtotal, country } = req.body;
    const result = await shippingService.calculateShipping({
      items,
      subtotal: parseFloat(subtotal) || 0,
      country,
    });
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const handleWebhook = async (req, res, next) => {
  try {
    const result = await shippingService.handleTrackingWebhook(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  calculateShipping,
  handleWebhook,
};
