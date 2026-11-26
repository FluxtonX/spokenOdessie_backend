const express = require("express");
const { protect, requirePostingAccess } = require("../../middlewares/auth.middleware");
const prisma = require("../../config/prisma");
const controller = require("./comment.controller");

const router = express.Router({ mergeParams: true });

router.use(async (req, res, next) => {
  try {
    const memory = await prisma.memory.findUnique({ where: { id: req.params.memoryId }, select: { status: true } });
    if (memory?.status === "removed") return res.status(404).json({ success: false, message: "This post has been removed by an administrator." });
    return next();
  } catch (error) { return next(error); }
});

router.get("/", protect, controller.getComments);
router.post("/", protect, requirePostingAccess, controller.createComment);
router.post("/:commentId/react", protect, controller.reactToComment);

module.exports = router;
