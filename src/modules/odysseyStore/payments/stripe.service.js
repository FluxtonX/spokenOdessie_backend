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

const COUNTRY_MAP = {
  "united states": "US",
  "united states of america": "US",
  "usa": "US",
  "us": "US",
  "canada": "CA",
  "ca": "CA",
  "united kingdom": "GB",
  "uk": "GB",
  "great britain": "GB",
  "gb": "GB",
  "australia": "AU",
  "germany": "DE",
  "france": "FR",
  "italy": "IT",
  "spain": "ES",
  "pakistan": "PK",
  "united arab emirates": "AE",
  "uae": "AE",
  "saudi arabia": "SA",
  "india": "IN",
  "japan": "JP",
  "netherlands": "NL",
  "sweden": "SE",
  "switzerland": "CH",
  "new zealand": "NZ",
  "singapore": "SG",
  "ireland": "IE",
  "norway": "NO",
  "denmark": "DK",
  "finland": "FI",
  "belgium": "BE",
  "austria": "AT",
  "portugal": "PT",
  "poland": "PL",
  "brazil": "BR",
  "mexico": "MX",
  "turkey": "TR",
  "south africa": "ZA",
};

const mapCountryToISO = (countryStr) => {
  if (!countryStr || typeof countryStr !== "string") return "US";
  const clean = countryStr.trim().toLowerCase();
  if (COUNTRY_MAP[clean]) return COUNTRY_MAP[clean];
  if (clean.length === 2) return clean.toUpperCase();
  return "US";
};

const createCheckoutSession = async ({
  lineItems,
  customerEmail,
  customerName,
  customerPhone,
  shippingAddress,
  successUrl,
  cancelUrl,
  metadata = {},
}) => {
  const stripe = getStripe();
  const sessionParams = {
    payment_method_types: ["card"],
    line_items: lineItems,
    mode: "payment",
    customer_email: customerEmail || undefined,
    phone_number_collection: { enabled: true },
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      source: "odyssey_store",
      ...metadata,
    },
  };

  const hasShipping =
    shippingAddress &&
    typeof shippingAddress === "object" &&
    Boolean(shippingAddress.address || shippingAddress.city || shippingAddress.postalCode);

  if (hasShipping) {
    delete sessionParams.shipping_address_collection;
    const isoCountry = mapCountryToISO(shippingAddress.country);
    const fullName = customerName || `${shippingAddress.firstName || ""} ${shippingAddress.lastName || ""}`.trim() || undefined;

    sessionParams.payment_intent_data = {
      shipping: {
        name: fullName || "Valued Customer",
        phone: customerPhone || shippingAddress.phone || undefined,
        address: {
          line1: shippingAddress.address || undefined,
          city: shippingAddress.city || undefined,
          postal_code: shippingAddress.postalCode || undefined,
          country: isoCountry,
        },
      },
    };
  } else {
    delete sessionParams.payment_intent_data;
    sessionParams.shipping_address_collection = {
      allowed_countries: [
        "US", "CA", "GB", "AU", "DE", "FR", "IT", "ES", "PK", "AE", "SA",
        "IN", "JP", "NL", "SE", "CH", "NZ", "SG", "IE", "NO", "DK", "FI",
        "BE", "AT", "PT", "PL", "BR", "MX", "TR", "ZA"
      ],
    };
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
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
