const express = require("express");
const multer = require("multer");

const { protect, optionalProtect } = require("../../middlewares/auth.middleware");
const controller = require("./memory.controller");
const commentRoutes = require("../comments/comment.routes");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 120 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype?.startsWith("image/") ||
      file.mimetype?.startsWith("video/") ||
      file.mimetype?.startsWith("audio/")
    ) {
      cb(null, true);
      return;
    }

    cb(new Error("Only image, video, or audio files are allowed"));
  },
});

router.use("/:memoryId/comments", commentRoutes);

router.get("/feed", protect, controller.getFeed);
router.get("/discovery", optionalProtect, controller.getDiscoveryMemories);
router.get("/family-shared", protect, controller.getFamilySharedMemories);
router.get("/", optionalProtect, controller.getMemories);
router.get("/:id", optionalProtect, controller.getMemoryDetails);
router.post("/", protect, upload.array("media", 10), controller.createMemory);
router.post("/:id/interact", protect, controller.interactWithMemory);
router.post("/:id/react", protect, controller.reactToMemory);
router.post("/:id/share", protect, controller.shareMemory);
router.patch("/:id", protect, upload.array("media", 10), controller.updateMemory);
router.delete("/:id", protect, controller.deleteMemory);


module.exports = router;

