const prisma = require("../../../config/prisma");

const findBySku = async (sku, tx = prisma) => {
  return tx.storeInventory.findUnique({
    where: { sku },
  });
};

const findByProductId = async (productId, tx = prisma) => {
  return tx.storeInventory.findMany({
    where: { productId },
    include: {
      variant: true,
      option: true,
    },
  });
};

const reserveStock = async ({ sku, quantity }, tx = prisma) => {
  const item = await tx.storeInventory.findUnique({
    where: { sku },
  });

  if (!item) {
    throw new Error(`Inventory item for SKU ${sku} not found`);
  }

  const available = item.quantity - item.reserved;
  if (available < quantity) {
    throw new Error(`Insufficient stock for SKU ${sku}. Available: ${available}, Requested: ${quantity}`);
  }

  return tx.storeInventory.update({
    where: { sku },
    data: {
      reserved: { increment: quantity },
    },
  });
};

const commitStock = async ({ sku, quantity }, tx = prisma) => {
  return tx.storeInventory.update({
    where: { sku },
    data: {
      quantity: { decrement: quantity },
      reserved: { decrement: quantity },
    },
  });
};

const releaseStock = async ({ sku, quantity }, tx = prisma) => {
  return tx.storeInventory.update({
    where: { sku },
    data: {
      reserved: { decrement: quantity },
    },
  });
};

const updateStock = async ({ sku, quantity, minThreshold }) => {
  return prisma.storeInventory.update({
    where: { sku },
    data: {
      ...(quantity !== undefined ? { quantity } : {}),
      ...(minThreshold !== undefined ? { minThreshold } : {}),
    },
  });
};

module.exports = {
  findBySku,
  findByProductId,
  reserveStock,
  commitStock,
  releaseStock,
  updateStock,
};
