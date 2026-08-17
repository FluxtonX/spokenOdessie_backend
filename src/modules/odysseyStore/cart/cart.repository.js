const prisma = require("../../../config/prisma");

const findOrCreateByUserId = async (userId) => {
  let cart = await prisma.storeCart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          product: {
            include: {
              variants: { where: { isActive: true } },
              options: { where: { isActive: true } },
            },
          },
          variant: true,
        },
      },
    },
  });

  if (!cart) {
    cart = await prisma.storeCart.create({
      data: { userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                variants: { where: { isActive: true } },
                options: { where: { isActive: true } },
              },
            },
            variant: true,
          },
        },
      },
    });
  }

  return cart;
};

const addItem = async ({ cartId, productId, variantId, storageOptionId, lensOptionId, quantity, unitPrice, mode = "add" }) => {
  // Check if identical configuration item exists in cart
  const existingItems = await prisma.storeCartItem.findMany({
    where: {
      cartId,
      productId,
    },
  });

  const existingItem =
    existingItems.find(
      (item) =>
        (!variantId || !item.variantId || item.variantId === variantId) &&
        (!storageOptionId || !item.storageOptionId || item.storageOptionId === storageOptionId) &&
        (!lensOptionId || !item.lensOptionId || item.lensOptionId === lensOptionId)
    ) || existingItems[0];

  if (existingItem) {
    const finalQuantity = mode === "set" ? quantity : (existingItem.quantity + quantity);
    return prisma.storeCartItem.update({
      where: { id: existingItem.id },
      data: {
        variantId: variantId || existingItem.variantId,
        storageOptionId: storageOptionId || existingItem.storageOptionId,
        lensOptionId: lensOptionId || existingItem.lensOptionId,
        quantity: Math.max(1, finalQuantity),
        unitPrice,
      },
    });
  }

  return prisma.storeCartItem.create({
    data: {
      cartId,
      productId,
      variantId: variantId || null,
      storageOptionId: storageOptionId || null,
      lensOptionId: lensOptionId || null,
      quantity: Math.max(1, quantity),
      unitPrice,
    },
  });
};

const updateItemQuantity = async ({ itemId, cartId, quantity }) => {
  if (quantity <= 0) {
    return prisma.storeCartItem.deleteMany({
      where: { id: itemId, cartId },
    });
  }

  return prisma.storeCartItem.updateMany({
    where: { id: itemId, cartId },
    data: { quantity },
  });
};

const removeItem = async ({ itemId, cartId }) => {
  return prisma.storeCartItem.deleteMany({
    where: { id: itemId, cartId },
  });
};

const clearCart = async (cartId) => {
  return prisma.storeCartItem.deleteMany({
    where: { cartId },
  });
};

module.exports = {
  findOrCreateByUserId,
  addItem,
  updateItemQuantity,
  removeItem,
  clearCart,
};
