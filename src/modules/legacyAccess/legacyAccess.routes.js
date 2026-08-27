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

/**
 * POST /api/legacy-access/request-release
 * Submit a request to release family vault
 */
router.post("/request-release", protect, legacyAccessController.requestVaultRelease);

/**
 * POST /api/legacy-access/verify-release/:requestId
 * Approve and verify a pending vault release request
 */
router.post("/verify-release/:requestId", protect, legacyAccessController.approveVaultRelease);

/**
 * POST /api/legacy-access/reject-release/:requestId
 * Reject a pending vault release request
 */
router.post("/reject-release/:requestId", protect, legacyAccessController.rejectVaultRelease);

/**
 * GET /api/legacy-access/vault-memories
 * Get time-capsule and vault memories for user/family
 */
router.get("/vault-memories", protect, legacyAccessController.getVaultMemories);

/**
 * GET /api/legacy-access/family-vaults
 * Get family circle member vaults and pending release requests
 */
router.get("/family-vaults", protect, legacyAccessController.getFamilyCircleVaults);

/**
 * GET /api/legacy-access/pending-requests
 * Get all pending vault release requests across family circle for admins
 */
router.get("/pending-requests", protect, legacyAccessController.getPendingVaultRequests);

module.exports = router;
