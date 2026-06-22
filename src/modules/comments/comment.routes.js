const express = require("express");
const { protect } = require("../../middlewares/auth.middleware");
const controller = require("./comment.controller");

const router = express.Router({ mergeParams: true });

router.get("/", protect, controller.getComments);
router.post("/", protect, controller.createComment);
router.post("/:commentId/react", protect, controller.reactToComment);

module.exports = router;
