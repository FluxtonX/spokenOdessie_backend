const express = require("express");
const multer = require("multer");

const { protect } = require("../../middlewares/auth.middleware");
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

router.get("/", protect, controller.getAlbums);
router.post("/", protect, upload.single("coverImage"), controller.createAlbum);

module.exports = router;
