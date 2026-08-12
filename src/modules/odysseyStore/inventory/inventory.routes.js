const express = require("express");
const controller = require("./inventory.controller");
const { protect } = require("../../../middlewares/auth.middleware");

const router = express.Router();

router.get("/check", controller.checkStock);
router.get("/product/:productId", controller.getProductInventory);

// Admin
router.patch("/:sku", protect, controller.updateInventory);

module.exports = router;
