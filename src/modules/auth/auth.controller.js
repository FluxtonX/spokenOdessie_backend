const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const admin = require("../../config/firebase");
const prisma = require("../../config/prisma");
const {
  uploadFileToS3,
  getSignedFileUrl,
} = require("../../services/s3.service");
const crypto = require("crypto");
const { getUserMfaState, generateMfaPendingToken } = require("../../services/mfa.service");
const { registerUserSession, getUserSessions, revokeSession, revokeOtherSessions } = require("../../services/session.service");

async function issueAuthTokenWithSession(user, req) {
  const sessionJti = crypto.randomUUID();
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role || "USER", jti: sessionJti },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  if (req) {
    try {
      await registerUserSession({ userId: user.id, sessionJti, req });
    } catch (err) {
      console.warn("Failed to register user session:", err.message);
    }
  }

  return token;
}

const JWT_SECRET = process.env.JWT_SECRET || "spoken_odyssey_super_secret_key_12345";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : undefined;

const normalizeStringList = (value) => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
};

const computeProfileCompleted = (user) =>
  Boolean(
    user.displayName &&
      user.displayName.trim() &&
      user.bio &&
      user.bio.trim() &&
      (user.photoKey || (user.photoURL && user.photoURL.trim())) &&
      user.defaultEntryPrivacy &&
      user.defaultEntryPrivacy.trim()
  );

const serializeUser = async (user) => {
  if (!user) {
    return null;
  }

  const result = { ...user };

  if (user.photoKey) {
    try {
      result.photoURL = await getSignedFileUrl(user.photoKey);
    } catch (_) {}
  }

  if (user.coverKey) {
    try {
      result.coverURL = await getSignedFileUrl(user.coverKey);
    } catch (_) {}
  } else if (!user.coverURL) {
    result.coverURL = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80";
  }

  try {
    result.followersCount = await prisma.follow.count({
      where: { followingId: user.id },
    });
    result.followingCount = await prisma.follow.count({
      where: { followerId: user.id },
    });
  } catch (err) {
    console.warn("Failed to get follow stats for user:", err.message);
    result.followersCount = 0;
    result.followingCount = 0;
  }

  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
  result.isActive = user.lastActive ? new Date(user.lastActive) > threeMinutesAgo : false;

  // Add compatibility fields
  result.firebaseUid = user.id;
  result.uid = user.id;

  return result;
};

/**
 * @desc    Register a new user (Email/Password)
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const emailLower = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: emailLower },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: emailLower,
        password: hashedPassword,
        passwordChangedAt: new Date(),
        displayName: displayName || emailLower.split("@")[0],
      },
    });

    // Generate JWT with Session Tracking
    const token = await issueAuthTokenWithSession(user, req);

    res.status(201).json({
      success: true,
      token,
      data: await serializeUser(user),
    });
  } catch (error) {
    console.error("Register Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server Error during registration",
    });
  }
};

/**
 * @desc    Login user (Email/Password)
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const emailLower = email.toLowerCase().trim();

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: emailLower },
    });

    if (!user || !user.password) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check MFA configuration
    const mfaState = await getUserMfaState(user.id);
    if (mfaState && mfaState.mfaEnabled) {
      const mfaToken = generateMfaPendingToken(user);
      return res.status(200).json({
        success: true,
        mfaRequired: true,
        availableMethods: mfaState.availableMethods,
        mfaToken,
      });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Issue JWT with Session Tracking
    const token = await issueAuthTokenWithSession(user, req);

    res.status(200).json({
      success: true,
      token,
      data: await serializeUser(user),
    });
  } catch (error) {
    console.error("Login Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server Error during login",
    });
  }
};

/**
 * @desc    Authenticate with Google ID token
 * @route   POST /api/auth/google
 * @access  Public
 */

const googleLogin = async (req, res) => {
  try {
    console.log("GOOGLE LOGIN BODY:", req.body);
    const { googleToken } = req.body;

    if (!googleToken) {
      return res.status(400).json({
        success: false,
        message: "Google token is required",
      });
    }

    // Verify token with Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(googleToken);
    const { uid: googleId, email, name, picture } = decodedToken;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required from Google login",
      });
    }

    const emailLower = email.toLowerCase().trim();

    let user = await prisma.user.findUnique({
      where: { email: emailLower },
    });

    if (user) {
      // Update google ID and info if empty
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: user.googleId || googleId,
          displayName: user.displayName || name,
          photoURL: user.photoURL || picture,
          lastLogin: new Date(),
        },
      });
    } else {
      // Create new user
      user = await prisma.user.create({
        data: {
          email: emailLower,
          googleId: googleId,
          displayName: name || emailLower.split("@")[0],
          photoURL: picture || null,
        },
      });
    }

    // Check MFA configuration
    const mfaState = await getUserMfaState(user.id);
    if (mfaState && mfaState.mfaEnabled) {
      const mfaToken = generateMfaPendingToken(user);
      return res.status(200).json({
        success: true,
        mfaRequired: true,
        availableMethods: mfaState.availableMethods,
        mfaToken,
      });
    }

    // Issue JWT with Session Tracking
    const token = await issueAuthTokenWithSession(user, req);

    res.status(200).json({
      success: true,
      token,
      data: await serializeUser(user),
    });
  } catch (error) {
    console.error("Google Login Error:", error.message);
    res.status(400).json({
      success: false,
      message: "Authentication failed: Invalid Google token",
    });
  }
};

/**
 * @desc    Update current user profile in PostgreSQL
 * @route   PUT /api/auth/profile
 * @access  Private
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found in database",
      });
    }

    let personalityQs = req.body.personalityQs;
    if (typeof personalityQs === "string") {
      try {
        personalityQs = JSON.parse(personalityQs);
      } catch (_) {
        personalityQs = undefined;
      }
    }

    let expertise = req.body.expertise;
    if (typeof expertise === "string") {
      try {
        expertise = JSON.parse(expertise);
      } catch (_) {
        expertise = undefined;
      }
    }

    const updates = {
      displayName: normalizeString(req.body.displayName),
      photoURL: normalizeString(req.body.photoURL),
      coverURL: normalizeString(req.body.coverURL),
      bio: normalizeString(req.body.bio),
      profession: normalizeString(req.body.profession),
      location: normalizeString(req.body.location),
      birthDate: normalizeString(req.body.birthDate),
      lifeMotto: normalizeString(req.body.lifeMotto),
      defaultEntryPrivacy: normalizeString(req.body.defaultEntryPrivacy),
      profileVisibility: normalizeString(req.body.profileVisibility),
      expertise: Array.isArray(expertise) ? normalizeStringList(expertise) : normalizeStringList(req.body.expertise),
      goals: normalizeString(req.body.goals),
      projects: normalizeString(req.body.projects),
      achievements: normalizeString(req.body.achievements),
      interests: normalizeString(req.body.interests),
      lessons: normalizeString(req.body.lessons),
      values: normalizeString(req.body.values),
      causes: normalizeString(req.body.causes),
    };

    // Filter updates
    const dataUpdate = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        dataUpdate[key] = value;
      }
    });

    if (Array.isArray(personalityQs)) {
      dataUpdate.personalityQs = personalityQs;
    }

    if (req.files) {
      if (req.files.profileImage?.[0]) {
        const { key } = await uploadFileToS3({
          file: req.files.profileImage[0],
          folder: `profiles/${userId}/avatar`,
        });
        dataUpdate.photoKey = key;
      }
      if (req.files.coverImage?.[0]) {
        const { key } = await uploadFileToS3({
          file: req.files.coverImage[0],
          folder: `profiles/${userId}/cover`,
        });
        dataUpdate.coverKey = key;
      }
    }

    let onboardingCompleted = req.body.onboardingCompleted;
    if (onboardingCompleted === "true") onboardingCompleted = true;
    if (onboardingCompleted === "false") onboardingCompleted = false;
    if (typeof onboardingCompleted === "boolean") {
      dataUpdate.onboardingCompleted = onboardingCompleted;
    }

    // Merge updates temporarily to check for profile completeness
    const mergedUser = { ...user, ...dataUpdate };

    let profileCompleted = req.body.profileCompleted;
    if (profileCompleted === "true") profileCompleted = true;
    if (profileCompleted === "false") profileCompleted = false;
    if (typeof profileCompleted === "boolean") {
      dataUpdate.profileCompleted =
        profileCompleted && computeProfileCompleted(mergedUser);
    } else {
      dataUpdate.profileCompleted = computeProfileCompleted(mergedUser);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: dataUpdate,
    });

    res.status(200).json({
      success: true,
      data: await serializeUser(updatedUser),
    });
  } catch (error) {
    console.error("Update Profile Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server Error while updating profile",
    });
  }
};

/**
 * @desc    Get current user profile from PostgreSQL
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found in database",
      });
    }

    res.status(200).json({
      success: true,
      data: await serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

/**
 * @desc    Request password reset link
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const emailLower = email.toLowerCase().trim();
    let user = await prisma.user.findUnique({ where: { email: emailLower } });

    // Universal Email Guarantee: If user does not exist in DB yet, create user record so Brevo email is ALWAYS dispatched
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: emailLower,
          displayName: emailLower.split("@")[0],
        },
      });
    }

    // Generate 6-digit numeric OTP code
    const crypto = require("crypto");
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpCodeHashed = crypto.createHash("sha256").update(otpCode).digest("hex");
    const resetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

    // Save hashed OTP token to database if possible
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: otpCodeHashed,
          passwordResetExpires: resetExpires,
        },
      });
    } catch (dbErr) {
      console.warn("⚠️ Warning updating user reset token in DB:", dbErr.message);
    }

    // Send email via Brevo email service
    const { sendPasswordResetEmail } = require("../../services/email.service");
    await sendPasswordResetEmail(emailLower, otpCode);

    res.status(200).json({
      success: true,
      message: `A 6-digit verification code has been sent to ${emailLower} via Brevo.`,
      ...(process.env.NODE_ENV !== "production" ? { dev_otp: otpCode } : {}),
    });
  } catch (error) {
    console.error("Forgot Password Error:", error.message);
    res.status(500).json({
      success: false,
      message: "An error occurred while processing forgot password request",
    });
  }
};

/**
 * @desc    Reset password using 6-digit OTP code or reset token
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
const resetPassword = async (req, res) => {
  try {
    const { token, otpCode, email, password, newPassword } = req.body;
    const providedCode = (otpCode || token || "").toString().trim();
    const targetPassword = password || newPassword;

    if (!providedCode || !email || !targetPassword) {
      return res.status(400).json({
        success: false,
        message: "Verification code, email address, and new password are required.",
      });
    }

    const emailLower = email.toLowerCase().trim();
    const crypto = require("crypto");
    const codeHashed = crypto.createHash("sha256").update(providedCode).digest("hex");

    const user = await prisma.user.findUnique({
      where: { email: emailLower },
    });

    if (
      !user ||
      user.passwordResetToken !== codeHashed ||
      new Date() > new Date(user.passwordResetExpires)
    ) {
      return res.status(400).json({
        success: false,
        message: "Verification code is invalid or has expired. Please request a new code.",
      });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(targetPassword, salt);

    // Save updated password, update passwordChangedAt, and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    res.status(200).json({
      success: true,
      message: "Password reset successfully. You can now log in with your new password.",
    });
  } catch (error) {
    console.error("Reset Password Error:", error.message);
    res.status(500).json({
      success: false,
      message: "An error occurred while resetting password",
    });
  }
};

/**
 * @desc    Change password for logged-in user
 * @route   PUT /api/auth/change-password
 * @access  Private
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: "New password is required",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // If user has existing password, verify current password
    if (user.password && currentPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect",
        });
      }
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Save updated password in PostgreSQL database
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    res.status(200).json({
      success: true,
      message: "Password updated successfully in database",
    });
  } catch (error) {
    console.error("Change Password Error:", error.message);
    res.status(500).json({
      success: false,
      message: "An error occurred while updating password",
    });
  }
};

/**
 * @desc    Send registration / verification email code
 * @route   POST /api/auth/send-verification
 * @access  Public
 */
const sendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const emailLower = email.toLowerCase().trim();
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    const { sendVerificationEmail } = require("../../services/email.service");
    await sendVerificationEmail(emailLower, verificationCode);

    res.status(200).json({
      success: true,
      message: `Verification code sent to ${emailLower} via Brevo`,
      ...(process.env.NODE_ENV !== "production" ? { dev_code: verificationCode } : {}),
    });
  } catch (error) {
    console.error("Send Verification Error:", error.message);
    res.status(500).json({ success: false, message: "An error occurred while sending verification email" });
  }
};

/**
 * Session & Notification Controllers
 */
const getActiveSessions = async (req, res) => {
  try {
    const sessions = await getUserSessions(req.user.id, req.user.sessionJti, req);
    res.status(200).json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const revokeSessionById = async (req, res) => {
  try {
    const { id } = req.params;
    await revokeSession(req.user.id, id);
    res.status(200).json({ success: true, message: "Session revoked successfully" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const revokeAllOtherSessions = async (req, res) => {
  try {
    await revokeOtherSessions(req.user.id, req.user.sessionJti);
    res.status(200).json({ success: true, message: "All other sessions revoked" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const toggleLoginNotifications = async (req, res) => {
  try {
    const { enabled } = req.body;
    const { updateUserNotificationPreferences } = require("../../services/notificationPreferences.service");
    const prefs = await updateUserNotificationPreferences(req.user.id, { loginNotifications: Boolean(enabled) });
    res.status(200).json({ success: true, loginNotifications: prefs.loginNotifications, preferences: prefs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getNotificationPreferencesController = async (req, res) => {
  try {
    const { getUserNotificationPreferences } = require("../../services/notificationPreferences.service");
    const preferences = await getUserNotificationPreferences(req.user.id);
    res.status(200).json({ success: true, preferences });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateNotificationPreferencesController = async (req, res) => {
  try {
    const { updateUserNotificationPreferences } = require("../../services/notificationPreferences.service");
    const preferences = await updateUserNotificationPreferences(req.user.id, req.body);
    res.status(200).json({ success: true, preferences });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
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
};
