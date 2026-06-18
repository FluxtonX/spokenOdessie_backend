const express = require("express");
const multer = require("multer");

const { protect } = require("../../middlewares/auth.middleware");
const controller = require("./memory.controller");

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

router.get("/", protect, controller.getMemories);
router.post("/", protect, upload.single("media"), controller.createMemory);
router.patch("/:id", protect, controller.updateMemory);
router.delete("/:id", protect, controller.deleteMemory);

module.exports = router;
