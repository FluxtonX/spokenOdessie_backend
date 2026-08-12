const express = require("express");
const controller = require("./cart.controller");
const { protect } = require("../../../middlewares/auth.middleware");

const router = express.Router();

// Cart endpoints require Spoken Odyssey authenticated user
router.use(protect);

router.get("/", controller.getCart);
router.post("/items", controller.addItem);
router.patch("/items/:id", controller.updateQuantity);
router.delete("/items/:id", controller.removeItem);
router.delete("/clear", controller.clearCart);

module.exports = router;
