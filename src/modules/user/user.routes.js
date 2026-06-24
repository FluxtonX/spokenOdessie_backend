const express = require("express");
const { protect } = require("../../middlewares/auth.middleware");
const controller = require("./user.controller");

const router = express.Router();

router.get("/discovery", protect, controller.getSuggested);
router.get("/family", protect, controller.getFamily);
router.post("/family", protect, controller.connectFamily);
router.delete("/family/:firebaseUid", protect, controller.disconnectFamily);
router.post("/follow/:firebaseUid", protect, controller.follow);
router.delete("/follow/:firebaseUid", protect, controller.unfollow);
router.get("/followers", protect, controller.getFollowers);
router.get("/following", protect, controller.getFollowing);
router.post("/heartbeat", protect, controller.heartbeat);

module.exports = router;
