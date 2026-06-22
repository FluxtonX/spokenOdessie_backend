const express = require("express");
const multer = require("multer");
const router = express.Router();
const { syncUser, getMe, updateProfile } = require("./auth.controller");
const { protect } = require("../../middlewares/auth.middleware");

const profileUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype?.startsWith("image/")) {
      return cb(null, true);
    }
    cb(new Error("Only image files are allowed for profile photos."));
  },
});

router.post("/sync", protect, syncUser);
router.get("/me", protect, getMe);
router.put(
  "/profile",
  protect,
  profileUpload.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "coverImage", maxCount: 1 }
  ]),
  updateProfile
);

module.exports = router;
