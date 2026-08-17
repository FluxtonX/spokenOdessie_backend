const easypostService = require("./easypost.service");
const prisma = require("../../../config/prisma");

const calculateShipping = async ({ items, subtotal = 0, country = "United States", destinationAddress = {} }) => {
  const addr = {
    country,
    countryCode: destinationAddress.countryCode || (country.length === 2 ? country : "US"),
    ...destinationAddress,
  };

  return easypostService.calculateRates({
    destinationAddress: addr,
    subtotal,
  });
};

/**
 * Handle live tracking webhook events from EasyPost (e.g. tracker.updated)
 */
const handleTrackingWebhook = async (eventBody) => {
  if (!eventBody) return { received: false };

  const description = eventBody.description || eventBody.type;
  const tracker = eventBody.result || eventBody.data?.object || eventBody;

  if (!tracker?.tracking_code) {
    return { received: true, ignored: true };
  }

  const trackingNumber = tracker.tracking_code;
  const rawStatus = (tracker.status || "").toLowerCase();

  // Find shipment in database
  const shipment = await prisma.storeShipment.findFirst({
    where: { trackingNumber },
    include: { order: true },
  });

  if (!shipment) {
    console.warn(`EasyPost webhook: No StoreShipment found matching tracking ${trackingNumber}`);
    return { received: true, notFound: true };
  }

  let orderStatus = shipment.order.status;
  let shipmentStatus = shipment.status;
  let statusNote = "";

  if (rawStatus === "in_transit" || rawStatus === "arrived_at_facility") {
    orderStatus = "SHIPPED";
    shipmentStatus = "IN_TRANSIT";
    statusNote = `Package in transit with ${shipment.carrier || "courier"}.`;
  } else if (rawStatus === "out_for_delivery") {
    orderStatus = "OUT_FOR_DELIVERY";
    shipmentStatus = "OUT_FOR_DELIVERY";
    statusNote = `Package is out for delivery today with ${shipment.carrier || "courier"}.`;
  } else if (rawStatus === "delivered") {
    orderStatus = "DELIVERED";
    shipmentStatus = "DELIVERED";
    statusNote = `Delivered successfully to customer destination.`;
  } else if (rawStatus === "return_to_sender") {
    orderStatus = "RETURN_REQUESTED";
    shipmentStatus = "RETURNED";
    statusNote = `Package returned to sender by courier.`;
  } else if (rawStatus === "failure" || rawStatus === "error") {
    shipmentStatus = "FAILED_ATTEMPT";
    statusNote = `Courier delivery attempt failed. Rescheduling.`;
  }

  await prisma.$transaction(async (tx) => {
    // 1. Update Shipment record
    await tx.storeShipment.update({
      where: { id: shipment.id },
      data: {
        status: shipmentStatus,
        ...(rawStatus === "delivered" ? { actualDelivery: new Date() } : {}),
        timeline: tracker.tracking_details || shipment.timeline,
      },
    });

    // 2. Update Order status if progressed
    if (orderStatus !== shipment.order.status) {
      await tx.storeOrder.update({
        where: { id: shipment.orderId },
        data: { status: orderStatus },
      });

      await tx.storeOrderStatusHistory.create({
        data: {
          orderId: shipment.orderId,
          status: orderStatus,
          notes: statusNote || `Courier status update: ${rawStatus}`,
          changedBy: "EASYPOST_COURIER",
        },
      });
    }
  });

  return { received: true, orderId: shipment.orderId, status: orderStatus };
};

module.exports = {
  calculateShipping,
  handleTrackingWebhook,
};
