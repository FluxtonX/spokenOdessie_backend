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

const addItem = async ({ cartId, productId, variantId, storageOptionId, lensOptionId, quantity, unitPrice }) => {
  // Check if identical configuration item exists in cart
  const existingItem = await prisma.storeCartItem.findFirst({
    where: {
      cartId,
      productId,
      variantId: variantId || null,
      storageOptionId: storageOptionId || null,
      lensOptionId: lensOptionId || null,
    },
  });

  if (existingItem) {
    return prisma.storeCartItem.update({
      where: { id: existingItem.id },
      data: {
        quantity: existingItem.quantity + quantity,
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
      quantity,
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
