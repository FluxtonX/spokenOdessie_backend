const express = require("express");
const multer = require("multer");

const { protect, optionalProtect } = require("../../middlewares/auth.middleware");
const controller = require("./album.controller");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype?.startsWith("image/")) {
      cb(null, true);
      return;
    }

    cb(new Error("Only image files are allowed"));
  },
});

router.get("/", optionalProtect, controller.getAlbums);
router.get("/space/:familyCircleId", protect, controller.getFamilyCircleAlbums);
router.get("/:id", protect, controller.getAlbumDetails);
router.post("/", protect, upload.single("coverImage"), controller.createAlbum);
router.post("/:id/memories", protect, controller.addMemoryToAlbum);
router.patch("/:id", protect, upload.single("coverImage"), controller.updateAlbum);
router.delete("/:id", protect, controller.deleteAlbum);

module.exports = router;
