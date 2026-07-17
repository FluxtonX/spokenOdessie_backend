const express = require("express");
const multer = require("multer");
const router = express.Router();
const { register, login, googleLogin, getMe, updateProfile, forgotPassword, resetPassword } = require("./auth.controller");
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

// Public Authentication Routes
router.post("/register", register);
router.post("/login", login);
router.post("/google", googleLogin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Compatibility alias for frontend syncing
router.post("/sync", protect, getMe);

// Protected Auth Routes
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
