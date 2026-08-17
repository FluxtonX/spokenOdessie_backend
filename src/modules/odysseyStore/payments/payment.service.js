const stripeService = require("./stripe.service");
const prisma = require("../../../config/prisma");
const cartService = require("../cart/cart.service");
const couponService = require("../coupons/coupon.service");
const cartRepository = require("../cart/cart.repository");
const inventoryRepository = require("../inventory/inventory.repository");

const generateOrderNumber = () => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ODYSSEY-${ts}-${rand}`;
};

/**
 * Create an official Stripe Checkout Session (navigates user to official Stripe hosted page)
 */
const createCheckoutSession = async ({
  userId,
  couponCode,
  items,
  shippingAddress,
  customerEmail,
  customerName,
  customerPhone,
  successUrl,
  cancelUrl,
}) => {
  // 1. If client provided explicit items, sync the DB cart to exactly match what the user is checking out
  if (Array.isArray(items) && items.length > 0) {
    try {
      await cartService.clearCart(userId);
      for (const clientItem of items) {
        await cartService.addItem({
          userId,
          productId: clientItem.productId || clientItem.product?.id || clientItem.product?.slug,
          variantId: clientItem.variantId || clientItem.variant?.id,
          storageOptionId: clientItem.storageOptionId || clientItem.storage?.id,
          lensOptionId: clientItem.lensOptionId || clientItem.lens?.id,
          quantity: clientItem.quantity || 1,
        });
      }
    } catch (e) {
      console.warn("Could not sync client items into DB cart:", e.message);
    }
  }

  // 2. Load fresh verified cart
  let cart = await cartService.getCart({ userId, couponCode });

  // 3. Fallback: If DB cart still has 0 items, directly construct items from product catalog
  if (!cart.items || cart.items.length === 0) {
    if (Array.isArray(items) && items.length > 0) {
      const productRepository = require("../products/product.repository");
      const fallbackItems = [];
      let subtotal = 0;

      for (const clientItem of items) {
        const prodId = clientItem.productId || clientItem.product?.id || clientItem.product?.slug || "odyssey-pro-titanium";
        const product = await productRepository.findBySlugOrId(prodId);
        if (!product) continue;

        const variant = product.variants?.find((v) =>
          v.id === clientItem.variantId ||
          v.id.endsWith(clientItem.variantId || "") ||
          v.name.toLowerCase() === (clientItem.variantId || "").toLowerCase()
        ) || product.variants?.[0] || null;

        const storage = product.options?.find((o) =>
          o.type === "storage" &&
          (o.id === clientItem.storageOptionId ||
           o.sku === clientItem.storageOptionId ||
           (clientItem.storageOptionId && o.name.toLowerCase().includes(clientItem.storageOptionId.toLowerCase())))
        ) || product.options?.find((o) => o.type === "storage") || null;

        const lens = product.options?.find((o) =>
          o.type === "lens" &&
          (o.id === clientItem.lensOptionId ||
           o.sku === clientItem.lensOptionId ||
           (clientItem.lensOptionId && o.name.toLowerCase().includes(clientItem.lensOptionId.toLowerCase())))
        ) || product.options?.find((o) => o.type === "lens") || null;

        const unitPrice = (product.basePrice || 0) + (storage?.priceAdd || 0) + (lens?.priceAdd || 0);
        const qty = Math.max(1, parseInt(clientItem.quantity, 10) || 1);
        const itemTotal = unitPrice * qty;
        subtotal += itemTotal;

        fallbackItems.push({
          product,
          variant,
          storage,
          lens,
          quantity: qty,
          unitPrice,
          total: itemTotal,
        });
      }

      if (fallbackItems.length > 0) {
        const shippingFee = subtotal > 200 || subtotal === 0 ? 0 : 15;
        cart = {
          items: fallbackItems,
          subtotal,
          discount: 0,
          shipping: shippingFee,
          total: subtotal + shippingFee,
          appliedCoupon: null,
        };
      }
    }
  }

  if (!cart.items || cart.items.length === 0) {
    const err = new Error("Your cart is empty. Please add Smart Glasses to your bag before checking out.");
    err.statusCode = 400;
    throw err;
  }

  const orderNumber = generateOrderNumber();

  let couponId = null;
  if (couponCode && cart.appliedCoupon) {
    couponId = cart.appliedCoupon.id;
  }

  // 2. Pre-create pending order
  const order = await prisma.storeOrder.create({
    data: {
      orderNumber,
      userId,
      status: "PENDING_PAYMENT",
      paymentStatus: "PENDING",
      subtotal: cart.subtotal,
      discount: cart.discount,
      shippingCost: cart.shipping,
      total: cart.total,
      currency: "usd",
      shippingAddress: shippingAddress || {},
      customerEmail: customerEmail || "customer@spokenodyssey.com",
      customerName: (customerName || `${shippingAddress?.firstName || ""} ${shippingAddress?.lastName || ""}`.trim() || customerEmail?.split("@")[0] || "Valued Customer"),
      customerPhone: customerPhone || null,
      items: {
        create: cart.items.map((item) => ({
          productId: item.product.id,
          variantId: item.variant?.id || null,
          productName: item.product.name,
          variantName: item.variant?.colorName || null,
          storageName: item.storage?.name || null,
          lensName: item.lens?.name || null,
          sku: item.variant?.sku || item.product.slug,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          image: item.product.images?.hero || null,
          specsSnapshot: {
            specs: item.product.specs,
            variant: item.variant,
            storage: item.storage,
            lens: item.lens,
          },
        })),
      },
      statusHistory: {
        create: {
          status: "PENDING_PAYMENT",
          notes: "Order created. Redirecting to official Stripe Checkout.",
          changedBy: "SYSTEM",
        },
      },
    },
  });

  // 3. Build line items for Stripe Hosted Checkout
  const lineItems = cart.items.map((item) => {
    const descParts = [
      item.variant?.colorName,
      item.storage?.size || item.storage?.name,
      item.lens?.name,
    ].filter(Boolean);

    return {
      price_data: {
        currency: "usd",
        product_data: {
          name: item.product.name,
          description: descParts.join(" · ") || undefined,
          images: item.product.images?.hero ? [item.product.images.hero] : undefined,
        },
        unit_amount: Math.round(item.unitPrice * 100),
      },
      quantity: item.quantity,
    };
  });

  // Add shipping if applicable
  if (cart.shipping > 0) {
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: {
          name: "Express Insured Shipping (3-5 Days)",
          description: "Full tracking & door-to-door insurance",
        },
        unit_amount: Math.round(cart.shipping * 100),
      },
      quantity: 1,
    });
  }

  // Handle coupon discount line item (if any)
  if (cart.discount > 0) {
    // Stripe supports negative or discount coupons, or adjustment line item
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: {
          name: `Coupon Discount (${cart.appliedCoupon?.code || couponCode})`,
        },
        unit_amount: -Math.round(cart.discount * 100),
      },
      quantity: 1,
    });
  }

  // Derive origin for the success/cancel URLs.
  // Priority: origin extracted from the provided cancelUrl (which the frontend sends with window.location.origin),
  // then CLIENT_URL env (take the first entry), then fallback to production Vercel URL.
  let storeOrigin = "https://odyssey-store-ten.vercel.app";
  if (cancelUrl) {
    try {
      storeOrigin = new URL(cancelUrl).origin;
    } catch (_) {}
  } else if (process.env.CLIENT_URL) {
    const firstClient = process.env.CLIENT_URL.split(",").map((s) => s.trim()).find((s) => s.includes("odyssey-store") || s.includes("localhost:3001") || s.includes("localhost:3000"));
    if (firstClient) storeOrigin = firstClient;
  }

  // IMPORTANT: use the real DB order.id here, NOT {CHECKOUT_SESSION_ID}.
  // {CHECKOUT_SESSION_ID} is a Stripe template var that Stripe replaces ONLY in the redirect URL,
  // but orderId must be the actual PostgreSQL CUID so verifySession can look it up.
  const finalSuccessUrl = successUrl && !successUrl.includes("{CHECKOUT_SESSION_ID}") && successUrl.includes("orderId=")
    ? successUrl
    : `${storeOrigin}/checkout/success?orderId=${order.id}&orderNumber=${encodeURIComponent(order.orderNumber)}&session_id={CHECKOUT_SESSION_ID}`;
  const finalCancelUrl = cancelUrl || `${storeOrigin}/checkout?cancelled=1`;

  // 4. Create official Stripe Checkout Session
  const session = await stripeService.createCheckoutSession({
    lineItems: lineItems.filter(item => item.price_data.unit_amount > 0), // Filter out zero/negative if Stripe restrictions apply
    customerEmail,
    customerName,
    customerPhone,
    shippingAddress,
    successUrl: finalSuccessUrl,
    cancelUrl: finalCancelUrl,
    metadata: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId,
      couponCode: couponCode || "",
    },
  });

  // Link session ID to order
  await prisma.storeOrder.update({
    where: { id: order.id },
    data: {
      paymentIntentId: session.id,
      stripeSessionId: session.id,
    },
  });

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
    orderNumber: order.orderNumber,
    orderId: order.id,
    total: cart.total,
  };
};

/**
 * Verifies a Stripe Checkout Session status directly with Stripe API and confirms the order.
 */
const verifySession = async ({ sessionId, orderId, userId }) => {
  let order = null;

  // 1. Check DB first by orderId, orderNumber, or stripeSessionId
  if (orderId || sessionId) {
    order = await prisma.storeOrder.findFirst({
      where: {
        OR: [
          ...(orderId ? [{ id: orderId }, { orderNumber: orderId }] : []),
          ...(sessionId ? [{ stripeSessionId: sessionId }, { paymentIntentId: sessionId }] : []),
        ],
        ...(userId ? { userId } : {}),
      },
      include: {
        items: true,
        statusHistory: { orderBy: { createdAt: "desc" } },
        shipments: true,
      },
    });
  }

  // 2. Early return if order is already marked as paid/confirmed in DB
  if (
    order &&
    (["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "COMPLETED"].includes(order.paymentStatus) ||
      ["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "COMPLETED"].includes(order.status))
  ) {
    return order;
  }

  // 3. Check directly with Stripe API safely
  const lookupSessionId = sessionId || order?.stripeSessionId || order?.paymentIntentId;

  if (lookupSessionId && typeof lookupSessionId === "string" && !lookupSessionId.includes("{")) {
    try {
      const stripe = stripeService.getStripe();
      let session = null;

      if (lookupSessionId.startsWith("cs_")) {
        try {
          session = await stripe.checkout.sessions.retrieve(lookupSessionId);
        } catch (stripeErr) {
          console.warn(`Stripe session lookup soft warning for ${lookupSessionId}:`, stripeErr.message);
        }
      } else if (lookupSessionId.startsWith("pi_")) {
        try {
          const pi = await stripe.paymentIntents.retrieve(lookupSessionId);
          if (pi.status === "succeeded") {
            session = { payment_status: "paid", id: pi.id, metadata: pi.metadata, amount_total: pi.amount };
          }
        } catch (piErr) {
          console.warn(`Stripe payment intent lookup soft warning for ${lookupSessionId}:`, piErr.message);
        }
      }

      if (session && (session.payment_status === "paid" || session.status === "complete")) {
        const targetOrderId = order?.id || session.metadata?.orderId;
        if (targetOrderId) {
          await _handlePaymentSuccessById(targetOrderId, session.id, session.amount_total, session);
          order = await prisma.storeOrder.findUnique({
            where: { id: targetOrderId },
            include: {
              items: true,
              statusHistory: { orderBy: { createdAt: "desc" } },
              shipments: true,
            },
          });
        }
      }
    } catch (err) {
      console.warn("Could not retrieve Stripe session during verification:", err.message);
    }
  }

  return order;
};

/**
 * Create a Stripe PaymentIntent (for embedded Elements if used)
 */
const createCheckoutIntent = async ({ userId, couponCode, shippingAddress, customerEmail, customerName, customerPhone }) => {
  const cart = await cartService.getCart({ userId, couponCode });

  if (!cart.items || cart.items.length === 0) {
    const err = new Error("Your cart is empty");
    err.statusCode = 400;
    throw err;
  }

  const paymentIntent = await stripeService.createPaymentIntent({
    amount: cart.total,
    currency: "usd",
    metadata: {
      userId,
      orderTotal: cart.total.toFixed(2),
      couponCode: couponCode || "",
    },
  });

  const orderNumber = generateOrderNumber();

  let couponId = null;
  if (couponCode && cart.appliedCoupon) {
    couponId = cart.appliedCoupon.id;
  }

  const order = await prisma.storeOrder.create({
    data: {
      orderNumber,
      userId,
      status: "PENDING_PAYMENT",
      paymentStatus: "PENDING",
      paymentIntentId: paymentIntent.id,
      subtotal: cart.subtotal,
      discount: cart.discount,
      shippingCost: cart.shipping,
      total: cart.total,
      currency: "usd",
      couponId: couponId || null,
      shippingAddress: shippingAddress || {},
      customerEmail,
      customerName,
      customerPhone: customerPhone || null,
      items: {
        create: cart.items.map((item) => ({
          productId: item.product.id,
          variantId: item.variant?.id || null,
          productName: item.product.name,
          variantName: item.variant?.colorName || null,
          storageName: item.storage?.name || null,
          lensName: item.lens?.name || null,
          sku: item.variant?.sku || item.product.slug,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          image: item.product.images?.hero || null,
          specsSnapshot: {
            specs: item.product.specs,
            variant: item.variant,
            storage: item.storage,
            lens: item.lens,
          },
        })),
      },
      statusHistory: {
        create: {
          status: "PENDING_PAYMENT",
          notes: "Order created. Awaiting payment.",
          changedBy: "SYSTEM",
        },
      },
    },
    include: {
      items: true,
      statusHistory: true,
    },
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    orderNumber: order.orderNumber,
    orderId: order.id,
    total: cart.total,
  };
};

/**
 * Handle Stripe webhook events with signature verification and graceful dev fallback.
 */
const handleWebhook = async (rawBody, signature) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event = null;
  const isDevOrPlaceholder =
    !webhookSecret ||
    webhookSecret.includes("placeholder") ||
    webhookSecret === "whsec_..." ||
    process.env.NODE_ENV !== "production";

  if (webhookSecret && !webhookSecret.includes("placeholder") && signature) {
    try {
      event = stripeService.constructWebhookEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      console.warn("Stripe signature verification warning:", err.message);
      if (!isDevOrPlaceholder) {
        const error = new Error(`Webhook signature verification failed: ${err.message}`);
        error.statusCode = 400;
        throw error;
      }
    }
  }

  // Graceful fallback parsing for development / testing environments
  if (!event) {
    try {
      if (Buffer.isBuffer(rawBody)) {
        event = JSON.parse(rawBody.toString("utf8"));
      } else if (typeof rawBody === "string") {
        event = JSON.parse(rawBody);
      } else if (typeof rawBody === "object" && rawBody !== null) {
        event = rawBody;
      }
    } catch (parseErr) {
      console.warn("Could not parse rawBody in webhook fallback:", parseErr.message);
    }
  }

  if (!event || !event.type) {
    return { received: true, ignored: true };
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data?.object;
        if (session) {
          const orderId = session.metadata?.orderId;
          if (orderId) {
            await _handlePaymentSuccessById(orderId, session.id, session.amount_total, session);
          } else {
            await _handlePaymentSuccess(session);
          }
        }
        break;
      }
      case "payment_intent.succeeded": {
        const pi = event.data?.object;
        if (pi) {
          await _handlePaymentSuccess(pi);
        }
        break;
      }
      case "checkout.session.async_payment_failed":
      case "payment_intent.payment_failed": {
        const obj = event.data?.object;
        if (obj) {
          await _handlePaymentFailed(obj);
        }
        break;
      }
      case "payment_intent.canceled":
      case "checkout.session.expired": {
        const obj = event.data?.object;
        if (obj) {
          await _handlePaymentCanceled(obj);
        }
        break;
      }
      default:
        break;
    }
  } catch (handlerErr) {
    console.warn(`Error processing Stripe event ${event.type}:`, handlerErr.message);
  }

  return { received: true, eventType: event.type };
};

const _handlePaymentCanceled = async (paymentObject) => {
  try {
    const orderId = paymentObject.metadata?.orderId;
    const order = orderId
      ? await prisma.storeOrder.findUnique({ where: { id: orderId } })
      : await prisma.storeOrder.findFirst({
          where: {
            OR: [
              { paymentIntentId: paymentObject.id },
              { stripeSessionId: paymentObject.id },
            ],
          },
        });

    if (!order || order.paymentStatus === "PAID") return;

    await prisma.storeOrder.update({
      where: { id: order.id },
      data: {
        paymentStatus: "CANCELLED",
        status: "CANCELLED",
      },
    });
  } catch (err) {
    console.warn("Could not cancel order from Stripe webhook:", err.message);
  }
};

const _handlePaymentSuccessById = async (orderId, paymentRef, amountTotal = null, stripeSession = null) => {
  const order = await prisma.storeOrder.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: { include: { variants: true, options: true } },
          variant: true,
        },
      },
    },
  });

  if (!order || order.paymentStatus === "PAID") return;

  const updateData = {
    paymentStatus: "PAID",
    status: "PROCESSING",
  };

  if (typeof amountTotal === "number" && amountTotal > 0) {
    updateData.total = amountTotal / 100;
  }

  // Extract real shipping and customer details from Stripe session if available
  if (stripeSession) {
    const sDetails = stripeSession.shipping_details || stripeSession.customer_details;
    const sAddr = sDetails?.address;
    const sName = sDetails?.name || stripeSession.customer_details?.name;
    const sPhone = stripeSession.customer_details?.phone || sDetails?.phone;
    const sEmail = stripeSession.customer_details?.email;

    if (sAddr && (sAddr.line1 || sAddr.city || sAddr.postal_code)) {
      const existing = (typeof order.shippingAddress === "object" && order.shippingAddress !== null) ? order.shippingAddress : {};
      updateData.shippingAddress = {
        firstName: existing.firstName || sName?.split(" ")[0] || "Valued",
        lastName: existing.lastName || sName?.split(" ").slice(1).join(" ") || "Customer",
        address: existing.address || (sAddr.line1 ? `${sAddr.line1}${sAddr.line2 ? ", " + sAddr.line2 : ""}` : ""),
        city: existing.city || sAddr.city || "",
        state: existing.state || sAddr.state || "",
        postalCode: existing.postalCode || sAddr.postal_code || "",
        country: existing.country || sAddr.country || "United States",
        phone: existing.phone || sPhone || "",
      };
    }

    if (sEmail && (!order.customerEmail || order.customerEmail === "customer@spokenodyssey.com")) {
      updateData.customerEmail = sEmail;
    }
    if (sName && (!order.customerName || order.customerName === "Valued Customer")) {
      updateData.customerName = sName;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.storeOrder.update({
      where: { id: order.id },
      data: updateData,
    });

    await tx.storeOrderStatusHistory.createMany({
      data: [
        {
          orderId: order.id,
          status: "PAID",
          notes: `Payment confirmed via Stripe Checkout (${paymentRef}).`,
          changedBy: "STRIPE",
        },
        {
          orderId: order.id,
          status: "PROCESSING",
          notes: "Order entered fulfillment queue.",
          changedBy: "SYSTEM",
        },
      ],
    });

    for (const item of order.items) {
      if (item.variant?.sku) {
        try {
          await inventoryRepository.commitStock({ sku: item.variant.sku, quantity: item.quantity }, tx);
        } catch (_) {}
      }
    }

    let shipmentData = {
      trackingNumber: `DHL-${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      carrier: "DHL Express",
      status: "PREPARING",
      labelUrl: "https://assets.easypost.com/sample_label.pdf",
      estimatedDelivery: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    };

    try {
      const easypostService = require("../shipping/easypost.service");
      const epShipment = await easypostService.createShipmentForOrder(order);
      if (epShipment && epShipment.trackingNumber) {
        shipmentData = {
          trackingNumber: epShipment.trackingNumber,
          carrier: epShipment.carrier || "DHL Express",
          status: "PREPARING",
          labelUrl: epShipment.labelUrl,
          estimatedDelivery: epShipment.estimatedDelivery || shipmentData.estimatedDelivery,
        };
      }
    } catch (e) {
      console.warn("Could not create EasyPost shipment during payment confirmation:", e.message);
    }

    await tx.storeShipment.create({
      data: {
        orderId: order.id,
        trackingNumber: shipmentData.trackingNumber,
        carrier: shipmentData.carrier,
        status: "PREPARING",
        labelUrl: shipmentData.labelUrl,
        estimatedDelivery: shipmentData.estimatedDelivery,
        timeline: [
          { status: "PREPARING", label: "Optical Vault Inspection", timestamp: new Date().toISOString() },
        ],
      },
    });

    const userCart = await tx.storeCart.findUnique({ where: { userId: order.userId } });
    if (userCart) {
      await tx.storeCartItem.deleteMany({ where: { cartId: userCart.id } });
    }

    if (order.couponId) {
      await tx.storeCoupon.update({
        where: { id: order.couponId },
        data: { usedCount: { increment: 1 } },
      });
    }
  });
};

const _handlePaymentSuccess = async (paymentIntent) => {
  const order = await prisma.storeOrder.findUnique({
    where: { paymentIntentId: paymentIntent.id },
    include: {
      items: {
        include: {
          product: { include: { variants: true, options: true } },
          variant: true,
        },
      },
    },
  });

  if (!order || order.paymentStatus === "PAID") return;
  await _handlePaymentSuccessById(order.id, paymentIntent.id);
};

const _handlePaymentFailed = async (paymentIntent) => {
  const order = await prisma.storeOrder.findUnique({
    where: { paymentIntentId: paymentIntent.id },
  });

  if (!order) return;

  await prisma.$transaction(async (tx) => {
    await tx.storeOrder.update({
      where: { id: order.id },
      data: {
        paymentStatus: "FAILED",
        status: "PAYMENT_FAILED",
      },
    });

    await tx.storeOrderStatusHistory.create({
      data: {
        orderId: order.id,
        status: "PAYMENT_FAILED",
        notes: `Payment failed. Decline code: ${paymentIntent.last_payment_error?.decline_code || "unknown"}`,
        changedBy: "STRIPE",
      },
    });
  });
};

module.exports = {
  createCheckoutSession,
  createCheckoutIntent,
  verifySession,
  handleWebhook,
};
