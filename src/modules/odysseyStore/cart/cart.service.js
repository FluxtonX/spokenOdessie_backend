const cartRepository = require("./cart.repository");
const productRepository = require("../products/product.repository");
const couponService = require("../coupons/coupon.service");
const prisma = require("../../../config/prisma");

const formatCart = async (cart, couponCode = null, userId = null) => {
  let subtotal = 0;
  const formattedItems = [];

  for (const item of cart.items) {
    const product = item.product;
    if (!product || product.status !== "ACTIVE") continue;

    const variant = item.variant || product.variants?.find((v) => v.id === item.variantId);
    const storageOption = product.options?.find((o) => o.id === item.storageOptionId || o.sku === item.storageOptionId);
    const lensOption = product.options?.find((o) => o.id === item.lensOptionId || o.sku === item.lensOptionId);

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

  let resolvedVariant = null;
  if (variantId) {
    resolvedVariant = product.variants?.find((v) => v.id === variantId || v.id.endsWith(variantId));
  }

  const storageOption = product.options?.find(
    (o) => o.id === storageOptionId || o.sku === storageOptionId || (o.type === "storage" && o.name === storageOptionId)
  );

  const lensOption = product.options?.find(
    (o) => o.id === lensOptionId || o.sku === lensOptionId || (o.type === "lens" && o.name === lensOptionId)
  );

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
