const express = require("express");
const multer = require("multer");
const router = express.Router();
const {
  register,
  login,
  googleLogin,
  getMe,
  updateProfile,
  forgotPassword,
  resetPassword,
  changePassword,
  sendVerification,
  getActiveSessions,
  revokeSessionById,
  revokeAllOtherSessions,
  toggleLoginNotifications,
  getNotificationPreferencesController,
  updateNotificationPreferencesController,
} = require("./auth.controller");
const {
  setupTotp,
  verifyTotpSetup,
  verifyTotpLogin,
  verifyRecoveryLogin,
  passkeyRegisterOptions,
  passkeyRegisterVerify,
  passkeyLoginOptions,
  passkeyLoginVerify,
  getMfaStatus,
  deletePasskey,
  regenerateRecoveryCodes,
  disableMfa,
} = require("./mfa.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { rateLimiters } = require("../../middlewares/rateLimit.middleware");

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
router.post("/register", rateLimiters.auth, register);
router.post("/login", rateLimiters.auth, login);
router.post("/google", rateLimiters.auth, googleLogin);
router.post("/forgot-password", rateLimiters.strict, forgotPassword);
router.post("/reset-password", rateLimiters.strict, resetPassword);
router.post("/send-verification", rateLimiters.strict, sendVerification);

// MFA Public / Pending State Routes
router.post("/mfa/totp/verify", rateLimiters.auth, verifyTotpLogin);
router.post("/mfa/recovery/verify", rateLimiters.auth, verifyRecoveryLogin);
router.post("/passkeys/login/options", passkeyLoginOptions);
router.post("/passkeys/login/verify", rateLimiters.auth, passkeyLoginVerify);

// Compatibility alias for frontend syncing
router.post("/sync", protect, getMe);

// Protected Auth Routes
router.get("/me", protect, getMe);
router.put("/change-password", protect, changePassword);
router.put(
  "/profile",
  protect,
  profileUpload.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "coverImage", maxCount: 1 }
  ]),
  updateProfile
);

// MFA Protected Security Routes
router.get("/mfa/status", protect, getMfaStatus);
router.post("/mfa/totp/setup", protect, setupTotp);
router.post("/mfa/totp/verify-setup", protect, rateLimiters.strict, verifyTotpSetup);
router.post("/mfa/recovery/regenerate", protect, rateLimiters.strict, regenerateRecoveryCodes);
router.post("/mfa/disable", protect, rateLimiters.strict, disableMfa);

// Passkey Protected Registration Routes
router.post("/passkeys/register/options", protect, passkeyRegisterOptions);
router.post("/passkeys/register/verify", protect, passkeyRegisterVerify);
router.delete("/passkeys/:id", protect, deletePasskey);

// Active Session Management & Security Notification Routes
router.get("/sessions", protect, getActiveSessions);
router.delete("/sessions/:id", protect, revokeSessionById);
router.delete("/sessions", protect, revokeAllOtherSessions);
router.put("/notifications/toggle", protect, toggleLoginNotifications);
router.get("/notifications/preferences", protect, getNotificationPreferencesController);
router.put("/notifications/preferences", protect, updateNotificationPreferencesController);

module.exports = router;

