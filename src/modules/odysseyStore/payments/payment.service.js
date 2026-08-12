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
  // 1. Load cart
  let cart = await cartService.getCart({ userId, couponCode });

  // If database cart is empty, but items are provided from client, populate DB cart
  if ((!cart.items || cart.items.length === 0) && Array.isArray(items) && items.length > 0) {
    for (const clientItem of items) {
      try {
        await cartService.addItem({
          userId,
          productId: clientItem.productId || clientItem.product?.id || clientItem.product?.slug,
          variantId: clientItem.variantId || clientItem.variant?.id,
          storageOptionId: clientItem.storageOptionId || clientItem.storage?.id,
          lensOptionId: clientItem.lensOptionId || clientItem.lens?.id,
          quantity: clientItem.quantity || 1,
        });
      } catch (e) {
        console.warn("Could not sync client item into DB cart:", e.message);
      }
    }
    // Re-fetch cart
    cart = await cartService.getCart({ userId, couponCode });
  }

  if (!cart.items || cart.items.length === 0) {
    const err = new Error("Your cart is empty");
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

  const finalSuccessUrl = successUrl || `https://odyssey-store-ten.vercel.app/checkout/success?orderId=${order.id}&orderNumber=${encodeURIComponent(order.orderNumber)}&session_id={CHECKOUT_SESSION_ID}`;
  const finalCancelUrl = cancelUrl || `https://odyssey-store-ten.vercel.app/checkout?cancelled=1`;

  // 4. Create official Stripe Checkout Session
  const session = await stripeService.createCheckoutSession({
    lineItems: lineItems.filter(item => item.price_data.unit_amount > 0), // Filter out zero/negative if Stripe restrictions apply
    customerEmail,
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
    data: { paymentIntentId: session.id },
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
 * Handle Stripe webhook events with signature verification.
 */
const handleWebhook = async (rawBody, signature) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    const err = new Error("Stripe webhook secret not configured");
    err.statusCode = 500;
    throw err;
  }

  let event;
  try {
    event = stripeService.constructWebhookEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const error = new Error(`Webhook signature verification failed: ${err.message}`);
    error.statusCode = 400;
    throw error;
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;
      if (orderId) {
        await _handlePaymentSuccessById(orderId, session.id);
      } else {
        await _handlePaymentSuccess(session);
      }
      break;
    }
    case "payment_intent.succeeded": {
      await _handlePaymentSuccess(event.data.object);
      break;
    }
    case "payment_intent.payment_failed": {
      await _handlePaymentFailed(event.data.object);
      break;
    }
    default:
      break;
  }

  return { received: true };
};

const _handlePaymentSuccessById = async (orderId, paymentRef) => {
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

  await prisma.$transaction(async (tx) => {
    await tx.storeOrder.update({
      where: { id: order.id },
      data: {
        paymentStatus: "PAID",
        status: "PROCESSING",
      },
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

    const trackingNumber = `TRK-${Date.now().toString(36).toUpperCase()}`;
    await tx.storeShipment.create({
      data: {
        orderId: order.id,
        trackingNumber,
        carrier: "DHL Express",
        status: "PREPARING",
        estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        timeline: [
          { status: "PREPARING", label: "Preparing Your Order", timestamp: new Date().toISOString() },
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
  handleWebhook,
};
