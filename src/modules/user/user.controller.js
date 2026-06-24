const userService = require("./user.service");

const getSuggested = async (req, res) => {
  try {
    const users = await userService.getSuggestedPeople({
      currentUser: req.user,
    });

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Get Suggested Users Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch suggestions",
    });
  }
};

const getFamily = async (req, res) => {
  try {
    const family = await userService.getFamilyMembers({
      currentUser: req.user,
    });

    res.status(200).json({
      success: true,
      data: family,
    });
  } catch (error) {
    console.error("Get Family Members Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch family members",
    });
  }
};

const connectFamily = async (req, res) => {
  try {
    const result = await userService.connectFamilyMember({
      currentUser: req.user,
      email: req.body.email,
      firebaseUid: req.body.firebaseUid,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Connect Family Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to establish connection",
    });
  }
};

const disconnectFamily = async (req, res) => {
  try {
    const result = await userService.disconnectFamilyMember({
      currentUser: req.user,
      targetFirebaseUid: req.params.firebaseUid,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Disconnect Family Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to remove connection",
    });
  }
};

const follow = async (req, res) => {
  try {
    const result = await userService.followUser({
      user: req.user,
      targetUid: req.params.firebaseUid,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Follow User Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to follow user",
    });
  }
};

const unfollow = async (req, res) => {
  try {
    const result = await userService.unfollowUser({
      user: req.user,
      targetUid: req.params.firebaseUid,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Unfollow User Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to unfollow user",
    });
  }
};

const getFollowers = async (req, res) => {
  try {
    const result = await userService.getFollowersList({
      user: req.user,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Get Followers Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to get followers",
    });
  }
};

const getFollowing = async (req, res) => {
  try {
    const result = await userService.getFollowingList({
      user: req.user,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Get Following Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to get following list",
    });
  }
};

const heartbeat = async (req, res) => {
  try {
    const result = await userService.updateUserActiveStatus({
      currentUser: req.user,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Heartbeat Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to update active status",
    });
  }
};

module.exports = {
  getSuggested,
  getFamily,
  connectFamily,
  disconnectFamily,
  follow,
  unfollow,
  getFollowers,
  getFollowing,
  heartbeat,
};
