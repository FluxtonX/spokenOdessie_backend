const Stripe = require("stripe");

let stripeInstance = null;

const getStripe = () => {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not configured");
    }
    stripeInstance = new Stripe(secretKey, {
      apiVersion: "2024-06-20",
    });
  }
  return stripeInstance;
};

const createCheckoutSession = async ({
  lineItems,
  customerEmail,
  successUrl,
  cancelUrl,
  metadata = {},
}) => {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: lineItems,
    mode: "payment",
    customer_email: customerEmail || undefined,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      source: "odyssey_store",
      ...metadata,
    },
  });
  return session;
};

const createPaymentIntent = async ({ amount, currency = "usd", metadata = {} }) => {
  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency,
    automatic_payment_methods: { enabled: true },
    metadata: {
      source: "odyssey_store",
      ...metadata,
    },
  });
  return paymentIntent;
};

const retrievePaymentIntent = async (paymentIntentId) => {
  const stripe = getStripe();
  return stripe.paymentIntents.retrieve(paymentIntentId);
};

const constructWebhookEvent = (payload, signature, secret) => {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(payload, signature, secret);
};

const refundPaymentIntent = async (paymentIntentId, amount = null) => {
  const stripe = getStripe();
  const params = { payment_intent: paymentIntentId };
  if (amount !== null) {
    params.amount = Math.round(amount * 100);
  }
  return stripe.refunds.create(params);
};

module.exports = {
  getStripe,
  createCheckoutSession,
  createPaymentIntent,
  retrievePaymentIntent,
  constructWebhookEvent,
  refundPaymentIntent,
};
