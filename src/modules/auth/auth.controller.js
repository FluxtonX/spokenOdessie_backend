const User = require("../user/user.model");
const {
  uploadFileToS3,
  getSignedFileUrl,
} = require("../../services/s3.service");

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

const serializeUser = async (userDocument) => {
  if (!userDocument) {
    return null;
  }

  const user =
    typeof userDocument.toObject === "function"
      ? userDocument.toObject()
      : { ...userDocument };

  if (user.photoKey) {
    try {
      user.photoURL = await getSignedFileUrl(user.photoKey);
    } catch (_) {}
  }

  if (user.coverKey) {
    try {
      user.coverURL = await getSignedFileUrl(user.coverKey);
    } catch (_) {}
  } else if (!user.coverURL) {
    user.coverURL = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80";
  }

  try {
    const Follow = require("../user/follow.model");
    user.followersCount = await Follow.countDocuments({ followingId: user.firebaseUid });
    user.followingCount = await Follow.countDocuments({ followerId: user.firebaseUid });
  } catch (err) {
    console.warn("Failed to get follow stats for user:", err.message);
    user.followersCount = 0;
    user.followingCount = 0;
  }

  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
  user.isActive = user.lastActive ? new Date(user.lastActive) > threeMinutesAgo : false;

  return user;
};

/**
 * @desc    Sync Firebase user with MongoDB
 * @route   POST /api/auth/sync
 * @access  Private
 */
const syncUser = async (req, res) => {
  try {
    const { uid, email, name, picture } = req.user;

    // Check if user exists
    let user = await User.findOne({ firebaseUid: uid });

    if (user) {
      // Update existing user info
      user.email = email || user.email;
      user.displayName = name || user.displayName;
      user.photoURL = picture || user.photoURL;
      user.lastLogin = Date.now();
      await user.save();
    } else {
      // Create new user
      user = await User.create({
        firebaseUid: uid,
        email: email,
        displayName: name,
        photoURL: picture,
      });
    }

    res.status(200).json({
      success: true,
      data: await serializeUser(user),
    });
  } catch (error) {
    console.error("Sync User Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server Error during user sync",
    });
  }
};

/**
 * @desc    Update current user profile in MongoDB
 * @route   PUT /api/auth/profile
 * @access  Private
 */
const updateProfile = async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });

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

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        user[key] = value;
      }
    });

    if (Array.isArray(personalityQs)) {
      user.personalityQs = personalityQs;
    }

    if (req.files) {
      if (req.files.profileImage?.[0]) {
        const { key } = await uploadFileToS3({
          file: req.files.profileImage[0],
          folder: `profiles/${req.user.uid}/avatar`,
        });
        user.photoKey = key;
      }
      if (req.files.coverImage?.[0]) {
        const { key } = await uploadFileToS3({
          file: req.files.coverImage[0],
          folder: `profiles/${req.user.uid}/cover`,
        });
        user.coverKey = key;
      }
    }

    if (typeof req.body.onboardingCompleted === "boolean") {
      user.onboardingCompleted = req.body.onboardingCompleted;
    }

    if (typeof req.body.profileCompleted === "boolean") {
      user.profileCompleted =
        req.body.profileCompleted && computeProfileCompleted(user);
    } else {
      user.profileCompleted = computeProfileCompleted(user);
    }

    await user.save();

    res.status(200).json({
      success: true,
      data: await serializeUser(user),
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
 * @desc    Get current user profile from MongoDB
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });

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

module.exports = {
  syncUser,
  getMe,
  updateProfile,
};
