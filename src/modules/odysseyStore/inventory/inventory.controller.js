const inventoryService = require("./inventory.service");

const checkStock = async (req, res, next) => {
  try {
    const { sku, quantity } = req.query;
    const result = await inventoryService.checkAvailability(sku, parseInt(quantity, 10) || 1);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getProductInventory = async (req, res, next) => {
  try {
    const inventory = await inventoryService.getProductInventory(req.params.productId);
    res.status(200).json({
      success: true,
      data: inventory,
    });
  } catch (error) {
    next(error);
  }
};

const updateInventory = async (req, res, next) => {
  try {
    const updated = await inventoryService.updateInventory(req.params.sku, req.body);
    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  checkStock,
  getProductInventory,
  updateInventory,
};
