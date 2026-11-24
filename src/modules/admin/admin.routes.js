const express = require("express");
const adminOnly = require("../../middlewares/adminOnly.middleware");
const { rateLimiters } = require("../../middlewares/rateLimit.middleware");
const controller = require("./admin.controller");

const router = express.Router();

router.post("/auth/login", rateLimiters.auth, controller.login);
router.use(adminOnly);
router.get("/auth/me", controller.getCurrentAdmin);
router.post("/auth/logout", controller.logout);
router.get("/dashboard", controller.getOverview);
router.get("/users", controller.getUsers);
router.get("/users/:id", controller.getUserDetails);
router.get("/families", controller.getFamilies);
router.get("/families/:id", controller.getFamilyDetails);

module.exports = router;
