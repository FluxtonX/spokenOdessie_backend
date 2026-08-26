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
    const mime = String(file.mimetype || "").toLowerCase();
    const name = String(file.originalname || "").toLowerCase();
    
    if (
      !mime ||
      mime === "application/octet-stream" ||
      mime.startsWith("image/") ||
      mime.startsWith("video/") ||
      mime.startsWith("audio/") ||
      /\.(jpg|jpeg|png|webp|gif|svg|bmp|mp4|webm|mov|m4v|avi|mp3|wav|m4a|ogg|aac|flac)$/i.test(name)
    ) {
      cb(null, true);
      return;
    }

    // Accept file by default to prevent silent upload failures
    cb(null, true);
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
router.get("/:memoryId/story-layers", optionalProtect, controller.getStoryLayers);
router.post("/:memoryId/story-layers", protect, controller.addStoryLayer);
router.patch("/:id", protect, upload.array("media", 10), controller.updateMemory);
router.delete("/:id", protect, controller.deleteMemory);


module.exports = router;

