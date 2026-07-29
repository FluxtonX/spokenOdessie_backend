const express = require("express");
const router = express.Router();
const familyCircleService = require("./familyCircle.service");
const { protect } = require("../../middlewares/auth.middleware");
const { rateLimiters } = require("../../middlewares/rateLimit.middleware");

/**
 * GET /api/family-circle
 * Get current user's family circle details
 */
router.get("/", protect, async (req, res) => {
  try {
    const circle = await familyCircleService.getOrCreateFamilyCircle({
      currentUser: req.user
    });
    res.json({
      success: true,
      data: circle
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to get family circle"
    });
  }
});

/**
 * GET /api/family-circle/members
 * Get all members of current user's family circle
 */
router.get("/members", protect, async (req, res) => {
  try {
    const members = await familyCircleService.getFamilyMembers({
      currentUser: req.user
    });
    res.json({
      success: true,
      data: members
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to get family members"
    });
  }
});

/**
 * GET /api/family-circle/shared-memories
 * Get all shared memories published by connected family members
 */
router.get("/shared-memories", protect, async (req, res) => {
  try {
    const memories = await familyCircleService.getFamilySharedMemories({
      currentUser: req.user
    });
    res.json({
      success: true,
      data: memories
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to get family shared memories"
    });
  }
});

/**
 * GET /api/family-circle/is-admin
 * Check if current user is admin of their family circle
 */
router.get("/is-admin", protect, async (req, res) => {
  try {
    const isAdmin = await familyCircleService.isFamilyAdmin({
      currentUser: req.user
    });
    res.json({
      success: true,
      data: { isAdmin }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to check admin status"
    });
  }
});

/**
 * POST /api/family-circle/members
 * Add member to family circle (admin only)
 */
router.post("/members", protect, rateLimiters.strict, async (req, res) => {
  try {
    const { targetUserId, relationship } = req.body;
    const member = await familyCircleService.addFamilyMember({
      currentUser: req.user,
      targetUserId,
      relationship
    });
    res.json({
      success: true,
      data: member
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to add family member"
    });
  }
});

/**
 * DELETE /api/family-circle/members/:userId
 * Remove member from family circle (admin only)
 */
router.delete("/members/:userId", protect, rateLimiters.strict, async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await familyCircleService.removeFamilyMember({
      currentUser: req.user,
      targetUserId: userId
    });
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to remove family member"
    });
  }
});

/**
 * POST /api/family-circle/members/:userId/promote
 * Promote member to admin (admin only)
 */
router.post("/members/:userId/promote", protect, rateLimiters.strict, async (req, res) => {
  try {
    const { userId } = req.params;
    const member = await familyCircleService.promoteToAdmin({
      currentUser: req.user,
      targetUserId: userId
    });
    res.json({
      success: true,
      data: member
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to promote member to admin"
    });
  }
});

/**
 * POST /api/family-circle/members/:userId/demote
 * Demote admin to member (admin only)
 */
router.post("/members/:userId/demote", protect, rateLimiters.strict, async (req, res) => {
  try {
    const { userId } = req.params;
    const member = await familyCircleService.demoteFromAdmin({
      currentUser: req.user,
      targetUserId: userId
    });
    res.json({
      success: true,
      data: member
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to demote admin to member"
    });
  }
});

/**
 * GET /api/family-circle/pending-approvals
 * Get pending approvals for admin (admin only)
 */
router.get("/pending-approvals", protect, async (req, res) => {
  try {
    const approvals = await familyCircleService.getPendingApprovals({
      currentUser: req.user
    });
    res.json({
      success: true,
      data: approvals
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to get pending approvals"
    });
  }
});

/**
 * POST /api/family-circle/approvals/:invitationId/approve
 * Approve pending invitation (admin only)
 */
router.post("/approvals/:invitationId/approve", protect, rateLimiters.strict, async (req, res) => {
  try {
    const { invitationId } = req.params;
    const member = await familyCircleService.approveInvitation({
      currentUser: req.user,
      invitationId
    });
    res.json({
      success: true,
      data: member
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to approve invitation"
    });
  }
});

/**
 * POST /api/family-circle/approvals/:invitationId/decline
 * Decline pending invitation (admin only)
 */
router.post("/approvals/:invitationId/decline", protect, rateLimiters.strict, async (req, res) => {
  try {
    const { invitationId } = req.params;
    const result = await familyCircleService.declineInvitation({
      currentUser: req.user,
      invitationId
    });
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to decline invitation"
    });
  }
});

module.exports = router;
