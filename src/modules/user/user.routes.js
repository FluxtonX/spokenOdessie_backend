const express = require("express");
const { protect, optionalProtect } = require("../../middlewares/auth.middleware");
const { rateLimiters } = require("../../middlewares/rateLimit.middleware");
const controller = require("./user.controller");

const router = express.Router();

router.get("/discovery", protect, controller.getSuggested);
router.get("/featured", optionalProtect, controller.getFeatured);
router.get("/family", protect, controller.getFamily);
router.post("/family", protect, rateLimiters.invitation, controller.connectFamily);
router.get("/family/invitations", protect, controller.getInvitations);
router.post("/family/invitations/:id/accept", protect, controller.acceptInvitation);
router.post("/family/invitations/:id/decline", protect, controller.declineInvitation);
router.delete("/family/:firebaseUid", protect, controller.disconnectFamily);
router.post("/follow/:firebaseUid", protect, controller.follow);
router.delete("/follow/:firebaseUid", protect, controller.unfollow);
router.get("/followers", protect, controller.getFollowers);
router.get("/following", protect, controller.getFollowing);
router.post("/heartbeat", protect, controller.heartbeat);

// New invitation endpoints with rate limiting
router.post("/family/invitations/sms", protect, rateLimiters.sms, controller.sendSMSInvitation);
router.post("/family/invitations/link", protect, rateLimiters.invitation, controller.createLinkInvitation);
router.post("/family/invitations/qr", protect, rateLimiters.invitation, controller.createQRInvitation);
router.get("/family/invitations/validate", rateLimiters.general, controller.validateInvitationToken);
router.get("/family/invitations/accept-token", protect, rateLimiters.strict, controller.acceptInvitationViaToken);
router.get("/:id", optionalProtect, controller.getUserById);

module.exports = router;
