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
      currentUser: req.user,
      targetUserId: req.query.userId,
      type: req.query.type,
      searchQuery: req.query.search,
      sort: req.query.sort,
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

const { requireFamilyRole } = require("../../middlewares/familyRbac");

/**
 * POST /api/family-circle/:familyCircleId/link-memory
 * Non-destructive linking of an individual memory to a family space
 */
router.post(
  "/:familyCircleId/link-memory",
  protect,
  requireFamilyRole(["ADMIN", "ADULT_MEMBER", "CONTRIBUTOR"]),
  async (req, res) => {
    try {
      const { familyCircleId } = req.params;
      const { memoryId } = req.body;
      const link = await familyCircleService.linkMemoryToFamilyCircle({
        currentUser: req.user,
        familyCircleId,
        memoryId,
      });
      res.json({
        success: true,
        data: link,
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to link memory to family space",
      });
    }
  }
);

/**
 * DELETE /api/family-circle/:familyCircleId/unlink-memory/:memoryId
 * Remove reference link ONLY (never deletes original memory)
 */
router.delete(
  "/:familyCircleId/unlink-memory/:memoryId",
  protect,
  requireFamilyRole(["ADMIN", "ADULT_MEMBER", "CONTRIBUTOR"]),
  async (req, res) => {
    try {
      const { familyCircleId, memoryId } = req.params;
      const result = await familyCircleService.unlinkMemoryFromFamilyCircle({
        currentUser: req.user,
        familyCircleId,
        memoryId,
      });
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to unlink memory from family space",
      });
    }
  }
);

/**
 * GET /api/family-circle/:familyCircleId/timeline
 * Cursor-paginated timeline query
 */
router.get(
  "/:familyCircleId/timeline",
  protect,
  requireFamilyRole([]),
  async (req, res) => {
    try {
      const { familyCircleId } = req.params;
      const { limit, cursor } = req.query;
      const timeline = await familyCircleService.getFamilyCircleTimeline({
        currentUser: req.user,
        familyCircleId,
        limit,
        cursor,
      });
      res.json({
        success: true,
        data: timeline,
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to fetch family space timeline",
      });
    }
  }
);

/**
 * Story Layers (Multi-perspective contributions to a memory)
 */
router.post("/memories/:memoryId/story-layers", protect, async (req, res) => {
  try {
    const { memoryId } = req.params;
    const { text, audioKey, audioDuration } = req.body;
    const layer = await familyCircleService.addStoryLayer({
      currentUser: req.user,
      memoryId,
      text,
      audioKey,
      audioDuration,
    });
    res.json({ success: true, data: layer });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to add story layer",
    });
  }
});

router.get("/memories/:memoryId/story-layers", protect, async (req, res) => {
  try {
    const { memoryId } = req.params;
    const layers = await familyCircleService.getStoryLayers({ memoryId });
    res.json({ success: true, data: layers });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch story layers",
    });
  }
});

/**
 * Ask the Family Prompts Engine
 */
router.post(
  "/:familyCircleId/prompts",
  protect,
  requireFamilyRole(["ADMIN", "ADULT_MEMBER", "CONTRIBUTOR", "MEMBER"]),
  async (req, res) => {
    try {
      const { familyCircleId } = req.params;
      const { question, category, audioKey, audioUrl } = req.body;
      const prompt = await familyCircleService.createFamilyPrompt({
        currentUser: req.user,
        familyCircleId,
        question,
        category,
        audioKey,
        audioUrl,
      });
      res.json({ success: true, data: prompt });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to create family prompt",
      });
    }
  }
);

router.get(
  "/:familyCircleId/prompts",
  protect,
  requireFamilyRole([]),
  async (req, res) => {
    try {
      const { familyCircleId } = req.params;
      const prompts = await familyCircleService.getFamilyPrompts({
        currentUser: req.user,
        familyCircleId,
      });
      res.json({ success: true, data: prompts });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to fetch family prompts",
      });
    }
  }
);

router.post("/prompts/:promptId/respond", protect, async (req, res) => {
  try {
    const { promptId } = req.params;
    const { text, audioKey, audioUrl } = req.body;
    const response = await familyCircleService.respondToFamilyPrompt({
      currentUser: req.user,
      promptId,
      text,
      audioKey,
      audioUrl,
    });
    res.json({ success: true, data: response });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to submit response",
    });
  }
});

/**
 * Guardian & Minor Controls (Phase 4)
 */
router.get(
  "/:familyCircleId/guardian-controls",
  protect,
  requireFamilyRole(["ADMIN", "ADULT_MEMBER"]),
  async (req, res) => {
    try {
      const { familyCircleId } = req.params;
      const controls = await familyCircleService.getGuardianControls({
        currentUser: req.user,
        familyCircleId,
      });
      res.json({ success: true, data: controls });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to fetch guardian controls",
      });
    }
  }
);

router.put(
  "/guardian-consent/:childUserId",
  protect,
  async (req, res) => {
    try {
      const { childUserId } = req.params;
      const { status, canPostWithoutApproval, allowMediaUploads } = req.body;
      const consent = await familyCircleService.updateGuardianConsent({
        currentUser: req.user,
        childUserId,
        status,
        canPostWithoutApproval,
        allowMediaUploads,
      });
      res.json({ success: true, data: consent });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to update guardian consent",
      });
    }
  }
);

/**
 * Family Relationship Graph APIs
 */
router.post(
  "/:familyCircleId/relationship-edge",
  protect,
  async (req, res) => {
    try {
      const { familyCircleId } = req.params;
      const { toUserId, relationshipCode, side } = req.body;
      const edge = await familyCircleService.upsertRelationshipEdge({
        currentUser: req.user,
        familyCircleId,
        toUserId,
        relationshipCode,
        side,
      });
      res.json({ success: true, data: edge });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to upsert relationship edge",
      });
    }
  }
);

router.get(
  "/:familyCircleId/relationship-graph",
  protect,
  async (req, res) => {
    try {
      const { familyCircleId } = req.params;
      const graph = await familyCircleService.getRelationshipGraph({
        currentUser: req.user,
        familyCircleId,
      });
      res.json({ success: true, data: graph });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to fetch relationship graph",
      });
    }
  }
);

module.exports = router;
