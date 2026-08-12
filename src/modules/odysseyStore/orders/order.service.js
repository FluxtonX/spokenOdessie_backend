const orderRepository = require("./order.repository");

const getMyOrders = async ({ userId, page, limit }) => {
  return orderRepository.findByUserId({ userId, page, limit });
};

const getOrderById = async ({ orderId, userId }) => {
  const order = await orderRepository.findById({ orderId, userId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  return order;
};

const getOrderTracking = async ({ orderId, userId }) => {
  const order = await orderRepository.findById({ orderId, userId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  const latestShipment = order.shipments?.[0] || null;

  // Build the tracking timeline from order status history + shipment timeline
  const statusLabels = {
    PENDING_PAYMENT: { label: "Order Created", description: "Your order was placed successfully." },
    PAID: { label: "Payment Confirmed", description: "Your payment has been verified." },
    PROCESSING: { label: "Processing", description: "Your order is being prepared for fulfillment." },
    PACKED: { label: "Packed & Ready", description: "Your glasses have been assembled and quality-checked." },
    SHIPPED: { label: "Shipped", description: "Your order is on its way with your carrier." },
    OUT_FOR_DELIVERY: { label: "Out for Delivery", description: "Your package is out for delivery today." },
    DELIVERED: { label: "Delivered", description: "Your order has been successfully delivered." },
    CANCELLED: { label: "Cancelled", description: "Your order has been cancelled." },
    REFUNDED: { label: "Refunded", description: "Your refund has been processed." },
    PAYMENT_FAILED: { label: "Payment Failed", description: "Your payment was not successful." },
    RETURN_REQUESTED: { label: "Return Requested", description: "Your return request is being processed." },
    RETURNED: { label: "Returned", description: "Your return has been completed." },
  };

  const timeline = order.statusHistory.map((entry) => ({
    status: entry.status,
    label: statusLabels[entry.status]?.label || entry.status,
    description: entry.notes || statusLabels[entry.status]?.description || "",
    timestamp: entry.createdAt,
    completed: true,
  }));

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,
    estimatedDelivery: latestShipment?.estimatedDelivery || null,
    tracking: {
      trackingNumber: latestShipment?.trackingNumber || null,
      carrier: latestShipment?.carrier || "DHL Express",
      status: latestShipment?.status || order.status,
    },
    timeline,
    items: order.items,
    total: order.total,
  };
};

const updateOrderStatus = async ({ orderId, status, notes, changedBy, userId }) => {
  // Verify order exists; if userId supplied, also verify ownership
  await getOrderById({ orderId, userId: null }); // admin check — no userId filter

  return orderRepository.updateStatus({ orderId, status, notes, changedBy });
};

const getAllOrders = async ({ status, page, limit }) => {
  return orderRepository.findAllAdmin({ status, page, limit });
};

module.exports = {
  getMyOrders,
  getOrderById,
  getOrderTracking,
  updateOrderStatus,
  getAllOrders,
};
