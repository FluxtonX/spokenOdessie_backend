const orderRepository = require("./order.repository");

const getMyOrders = async ({ userId, page, limit }) => {
  const result = await orderRepository.findByUserId({ userId, page, limit });

  // Dynamically sync any pending orders if paid on Stripe
  try {
    const paymentService = require("../payments/payment.service");
    for (const ord of result.orders) {
      if (ord.paymentStatus === "PENDING" && (ord.paymentIntentId || ord.stripeSessionId)) {
        await paymentService.verifySession({
          sessionId: ord.stripeSessionId || ord.paymentIntentId,
          orderId: ord.id,
        });
      }
    }
  } catch (_) {}

  return orderRepository.findByUserId({ userId, page, limit });
};

const getOrderById = async ({ orderId, userId }) => {
  let order = await orderRepository.findById({ orderId, userId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (order.paymentStatus === "PENDING" && (order.paymentIntentId || order.stripeSessionId)) {
    try {
      const paymentService = require("../payments/payment.service");
      await paymentService.verifySession({
        sessionId: order.stripeSessionId || order.paymentIntentId,
        orderId: order.id,
      });
      order = await orderRepository.findById({ orderId, userId });
    } catch (_) {}
  }

  return order;
};

const getOrderTracking = async ({ orderId, userId }) => {
  let order = await orderRepository.findById({ orderId, userId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (order.paymentStatus === "PENDING" && (order.paymentIntentId || order.stripeSessionId)) {
    try {
      const paymentService = require("../payments/payment.service");
      await paymentService.verifySession({
        sessionId: order.stripeSessionId || order.paymentIntentId,
        orderId: order.id,
      });
      order = await orderRepository.findById({ orderId, userId });
    } catch (_) {}
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

const dispatchOrder = async ({ orderId, carrier = "DHL Express", trackingNumber, labelUrl, notes = "Handed to courier" }) => {
  const order = await getOrderById({ orderId, userId: null });
  const easypostService = require("../shipping/easypost.service");
  const prisma = require("../../../config/prisma");

  let finalTracking = trackingNumber;
  let finalCarrier = carrier;
  let finalLabel = labelUrl;
  let finalEstimatedDelivery = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);

  // If no tracking number provided, auto-generate via EasyPost
  if (!finalTracking) {
    const shipmentResult = await easypostService.createShipmentForOrder(order);
    finalTracking = shipmentResult.trackingNumber;
    finalCarrier = shipmentResult.carrier;
    finalLabel = shipmentResult.labelUrl;
    finalEstimatedDelivery = shipmentResult.estimatedDelivery;
  }

  const shipment = await prisma.storeShipment.upsert({
    where: { trackingNumber: finalTracking },
    create: {
      orderId: order.id,
      trackingNumber: finalTracking,
      carrier: finalCarrier,
      status: "SHIPPED",
      labelUrl: finalLabel,
      estimatedDelivery: finalEstimatedDelivery,
      timeline: [
        { status: "PREPARING", label: "Optical Vault Inspection", timestamp: new Date().toISOString() },
        { status: "SHIPPED", label: `Dispatched with ${finalCarrier}`, timestamp: new Date().toISOString() },
      ],
    },
    update: {
      carrier: finalCarrier,
      status: "SHIPPED",
      labelUrl: finalLabel || undefined,
      estimatedDelivery: finalEstimatedDelivery,
    },
  });

  // Update order status to SHIPPED
  await prisma.storeOrder.update({
    where: { id: order.id },
    data: { status: "SHIPPED" },
  });

  await prisma.storeOrderStatusHistory.create({
    data: {
      orderId: order.id,
      status: "SHIPPED",
      notes: `${notes} (Tracking: ${finalTracking} via ${finalCarrier})`,
      changedBy: "COURIER_DISPATCH",
    },
  });

  return {
    success: true,
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: "SHIPPED",
    shipment,
  };
};

const getAllOrders = async ({ status, page, limit }) => {
  return orderRepository.findAllAdmin({ status, page, limit });
};

module.exports = {
  getMyOrders,
  getOrderById,
  getOrderTracking,
  updateOrderStatus,
  dispatchOrder,
  getAllOrders,
};
