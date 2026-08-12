const inventoryRepository = require("./inventory.repository");

const checkAvailability = async (sku, quantity = 1) => {
  const item = await inventoryRepository.findBySku(sku);
  if (!item) return { available: false, stock: 0 };
  const available = item.quantity - item.reserved;
  return {
    available: available >= quantity,
    stock: Math.max(0, available),
    sku,
  };
};

const getProductInventory = async (productId) => {
  return inventoryRepository.findByProductId(productId);
};

const updateInventory = async (sku, data) => {
  return inventoryRepository.updateStock({
    sku,
    quantity: data.quantity,
    minThreshold: data.minThreshold,
  });
};

module.exports = {
  checkAvailability,
  getProductInventory,
  updateInventory,
};
