const express = require("express");
const controller = require("./category.controller");
const { protect } = require("../../../middlewares/auth.middleware");

const router = express.Router();

router.get("/", controller.getCategories);
router.get("/:slug", controller.getCategoryBySlug);

// Admin routes
router.post("/", protect, controller.createCategory);
router.put("/:id", protect, controller.updateCategory);
router.delete("/:id", protect, controller.deleteCategory);

module.exports = router;
