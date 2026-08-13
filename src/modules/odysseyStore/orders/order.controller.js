const orderService = require("./order.service");

const getMyOrders = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const result = await orderService.getMyOrders({ userId, page, limit });
    res.status(200).json({
      success: true,
      data: result.orders,
      pagination: {
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const orderId = req.params.id;
    const order = await orderService.getOrderById({ orderId, userId });
    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

const getOrderTracking = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const orderId = req.params.id;
    const tracking = await orderService.getOrderTracking({ orderId, userId });
    res.status(200).json({
      success: true,
      data: tracking,
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Update order status
const updateOrderStatus = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const { status, notes } = req.body;
    const updated = await orderService.updateOrderStatus({
      orderId,
      status,
      notes,
      changedBy: req.user.displayName || req.user.email || "ADMIN",
    });
    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Get all orders
const getAllOrders = async (req, res, next) => {
  try {
    const { status } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const result = await orderService.getAllOrders({ status, page, limit });
    res.status(200).json({
      success: true,
      data: result.orders,
      pagination: {
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Dispatch & hand to courier
const dispatchOrder = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const { carrier, trackingNumber, labelUrl, notes } = req.body;
    const result = await orderService.dispatchOrder({
      orderId,
      carrier,
      trackingNumber,
      labelUrl,
      notes,
    });
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyOrders,
  getOrderById,
  getOrderTracking,
  updateOrderStatus,
  dispatchOrder,
  getAllOrders,
};
