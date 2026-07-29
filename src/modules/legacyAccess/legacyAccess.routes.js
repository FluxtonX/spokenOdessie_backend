const express = require("express");
const router = express.Router();
const legacyAccessController = require("./legacyAccess.controller");
const { protect } = require("../../middlewares/auth.middleware");

/**
 * GET /api/legacy-access
 * Get current user's legacy access settings
 */
router.get("/", protect, legacyAccessController.getLegacySettings);

/**
 * PUT /api/legacy-access
 * Update current user's legacy access settings
 */
router.put("/", protect, legacyAccessController.updateLegacySettings);

module.exports = router;
