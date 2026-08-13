const cartRepository = require("./cart.repository");
const productRepository = require("../products/product.repository");
const couponService = require("../coupons/coupon.service");
const prisma = require("../../../config/prisma");

const resolveVariant = (product, variantId) => {
  if (!product?.variants || product.variants.length === 0) return null;
  if (!variantId) return product.variants[0];
  const clean = variantId.toLowerCase().trim();
  return (
    product.variants.find(
      (v) =>
        v.id.toLowerCase() === clean ||
        v.id.toLowerCase().endsWith(clean) ||
        v.id.toLowerCase().endsWith(`-${clean}`) ||
        v.name.toLowerCase() === clean ||
        (v.sku && v.sku.toLowerCase() === clean) ||
        (v.colorName && v.colorName.toLowerCase() === clean)
    ) || product.variants[0]
  );
};

const resolveStorage = (product, storageOptionId) => {
  if (!product?.options) return null;
  const storageOptions = product.options.filter((o) => o.type === "storage");
  if (storageOptions.length === 0) return null;
  if (!storageOptionId) return storageOptions[0];

  const clean = storageOptionId.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    storageOptions.find((o) => {
      const oId = o.id.toLowerCase();
      const oSku = (o.sku || "").toLowerCase();
      const oName = (o.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const oSize = (o.size || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return (
        o.id === storageOptionId ||
        oSku === storageOptionId.toLowerCase() ||
        oName === clean ||
        oSize === clean ||
        oId.endsWith(storageOptionId.toLowerCase()) ||
        (clean.includes("64") && (oSku.includes("64") || oName.includes("64"))) ||
        (clean.includes("128") && (oSku.includes("128") || oName.includes("128"))) ||
        (clean.includes("256") && (oSku.includes("256") || oName.includes("256")))
      );
    }) || storageOptions[0]
  );
};

const resolveLens = (product, lensOptionId) => {
  if (!product?.options) return null;
  const lensOptions = product.options.filter((o) => o.type === "lens");
  if (lensOptions.length === 0) return null;
  if (!lensOptionId) return lensOptions[0];

  const clean = lensOptionId.toLowerCase().trim();
  return (
    lensOptions.find((o) => {
      const oId = o.id.toLowerCase();
      const oSku = (o.sku || "").toLowerCase();
      const oName = (o.name || "").toLowerCase();
      return (
        o.id === lensOptionId ||
        oSku === clean ||
        oName.includes(clean) ||
        oId.endsWith(clean) ||
        (clean.includes("blue") && (oSku.includes("blu") || oName.includes("blue"))) ||
        (clean.includes("sun") && (oSku.includes("sun") || oName.includes("sun") || oName.includes("polar"))) ||
        (clean.includes("polar") && (oSku.includes("sun") || oName.includes("polar"))) ||
        (clean.includes("prescrip") && (oSku.includes("rx") || oName.includes("prescrip"))) ||
        (clean.includes("mir") && (oSku.includes("mir") || oName.includes("mirror")))
      );
    }) || lensOptions[0]
  );
};

const formatCart = async (cart, couponCode = null, userId = null) => {
  let subtotal = 0;
  const formattedItems = [];

  for (const item of cart.items) {
    const product = item.product;
    if (!product || product.status !== "ACTIVE") continue;

    const variant = resolveVariant(product, item.variantId);
    const storageOption = resolveStorage(product, item.storageOptionId);
    const lensOption = resolveLens(product, item.lensOptionId);

    const basePrice = product.basePrice || 0;
    const storagePrice = storageOption?.priceAdd || 0;
    const lensPrice = lensOption?.priceAdd || 0;
    const unitPrice = basePrice + storagePrice + lensPrice;

    const itemTotal = unitPrice * item.quantity;
    subtotal += itemTotal;

    formattedItems.push({
      id: item.id,
      cartItemId: `${product.id}-${variant?.id || "default"}-${storageOption?.id || "default"}-${lensOption?.id || "default"}`,
      product: {
        id: product.id,
        slug: product.slug,
        name: product.name,
        tagline: product.tagline,
        badge: product.badge,
        basePrice: product.basePrice,
        images: product.images,
        specs: product.specs,
      },
      variant: variant
        ? {
            id: variant.id,
            name: variant.name,
            colorHex: variant.colorHex,
            colorName: variant.colorName,
            badge: variant.badge,
          }
        : null,
      storage: storageOption
        ? {
            id: storageOption.id,
            size: storageOption.size,
            name: storageOption.name,
            priceAdd: storageOption.priceAdd,
            description: storageOption.description,
          }
        : null,
      lens: lensOption
        ? {
            id: lensOption.id,
            name: lensOption.name,
            priceAdd: lensOption.priceAdd,
            type: lensOption.description || lensOption.name,
          }
        : null,
      quantity: item.quantity,
      unitPrice,
      total: itemTotal,
    });
  }

  let discountAmount = 0;
  let appliedCouponData = null;

  if (couponCode) {
    try {
      const couponValidation = await couponService.validateCoupon({
        code: couponCode,
        userId,
        subtotal,
      });
      discountAmount = couponValidation.coupon.discountAmount;
      appliedCouponData = couponValidation.coupon;
    } catch (_) {}
  }

  const shippingFee = subtotal > 200 || subtotal === 0 ? 0 : 15;
  const grandTotal = Math.max(0, subtotal - discountAmount + shippingFee);

  return {
    id: cart.id,
    userId: cart.userId,
    items: formattedItems,
    itemsCount: formattedItems.reduce((sum, i) => sum + i.quantity, 0),
    subtotal,
    discount: discountAmount,
    shipping: shippingFee,
    total: grandTotal,
    appliedCoupon: appliedCouponData,
  };
};

const getCart = async ({ userId, couponCode }) => {
  const cart = await cartRepository.findOrCreateByUserId(userId);
  return formatCart(cart, couponCode, userId);
};

const addItem = async ({ userId, productId, variantId, storageOptionId, lensOptionId, quantity = 1 }) => {
  const product = await productRepository.findBySlugOrId(productId);
  if (!product || product.status !== "ACTIVE") {
    const error = new Error("Product not available");
    error.statusCode = 404;
    throw error;
  }

  const resolvedVariant = resolveVariant(product, variantId);
  const storageOption = resolveStorage(product, storageOptionId);
  const lensOption = resolveLens(product, lensOptionId);

  const unitPrice = (product.basePrice || 0) + (storageOption?.priceAdd || 0) + (lensOption?.priceAdd || 0);

  const cart = await cartRepository.findOrCreateByUserId(userId);
  await cartRepository.addItem({
    cartId: cart.id,
    productId: product.id,
    variantId: resolvedVariant ? resolvedVariant.id : null,
    storageOptionId: storageOption ? storageOption.id : null,
    lensOptionId: lensOption ? lensOption.id : null,
    quantity: Math.max(1, parseInt(quantity, 10) || 1),
    unitPrice,
  });

  const updatedCart = await cartRepository.findOrCreateByUserId(userId);
  return formatCart(updatedCart, null, userId);
};

const updateQuantity = async ({ userId, itemId, quantity }) => {
  const cart = await cartRepository.findOrCreateByUserId(userId);
  await cartRepository.updateItemQuantity({
    itemId,
    cartId: cart.id,
    quantity: parseInt(quantity, 10) || 0,
  });

  const updatedCart = await cartRepository.findOrCreateByUserId(userId);
  return formatCart(updatedCart, null, userId);
};

const removeItem = async ({ userId, itemId }) => {
  const cart = await cartRepository.findOrCreateByUserId(userId);
  await cartRepository.removeItem({ itemId, cartId: cart.id });

  const updatedCart = await cartRepository.findOrCreateByUserId(userId);
  return formatCart(updatedCart, null, userId);
};

const clearCart = async (userId) => {
  const cart = await cartRepository.findOrCreateByUserId(userId);
  await cartRepository.clearCart(cart.id);

  const updatedCart = await cartRepository.findOrCreateByUserId(userId);
  return formatCart(updatedCart, null, userId);
};

module.exports = {
  getCart,
  addItem,
  updateQuantity,
  removeItem,
  clearCart,
  formatCart,
};
