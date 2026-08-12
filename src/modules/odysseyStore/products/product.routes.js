const express = require("express");
const controller = require("./product.controller");
const { protect } = require("../../../middlewares/auth.middleware");

const router = express.Router();

router.get("/", controller.getProducts);
router.get("/:id", controller.getProductByIdentifier);

// Protected Admin routes
router.post("/", protect, controller.createProduct);
router.put("/:id", protect, controller.updateProduct);
router.delete("/:id", protect, controller.deleteProduct);

module.exports = router;
