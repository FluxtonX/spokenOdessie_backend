const cartService = require("./cart.service");

const getCart = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { couponCode } = req.query;
    const cart = await cartService.getCart({ userId, couponCode });
    res.status(200).json({
      success: true,
      data: cart,
    });
  } catch (error) {
    next(error);
  }
};

const addItem = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { productId, variantId, storageOptionId, lensOptionId, quantity, mode } = req.body;
    const cart = await cartService.addItem({
      userId,
      productId,
      variantId,
      storageOptionId,
      lensOptionId,
      quantity,
      mode,
    });
    res.status(200).json({
      success: true,
      data: cart,
    });
  } catch (error) {
    next(error);
  }
};

const updateQuantity = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;
    const { quantity } = req.body;
    const cart = await cartService.updateQuantity({
      userId,
      itemId,
      quantity,
    });
    res.status(200).json({
      success: true,
      data: cart,
    });
  } catch (error) {
    next(error);
  }
};

const removeItem = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const itemId = req.params.id;
    const cart = await cartService.removeItem({
      userId,
      itemId,
    });
    res.status(200).json({
      success: true,
      data: cart,
    });
  } catch (error) {
    next(error);
  }
};

const clearCart = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const cart = await cartService.clearCart(userId);
    res.status(200).json({
      success: true,
      data: cart,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCart,
  addItem,
  updateQuantity,
  removeItem,
  clearCart,
};
