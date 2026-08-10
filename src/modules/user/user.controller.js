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

const getFeatured = async (req, res) => {
  try {
    const users = await userService.getFeaturedPeople({
      currentUser: req.user,
      category: req.query.category,
      query: req.query.q,
    });

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Get Featured Users Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch featured people",
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
    const result = await userService.sendFamilyInvitation({
      currentUser: req.user,
      email: req.body.email,
      firebaseUid: req.body.firebaseUid,
      relationship: req.body.relationship,
      method: req.body.method || "EMAIL",
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Connect Family Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to send invitation",
    });
  }
};

const getInvitations = async (req, res) => {
  try {
    const result = await userService.getPendingInvitations({
      currentUser: req.user,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Get Invitations Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch invitations",
    });
  }
};

const acceptInvitation = async (req, res) => {
  try {
    const result = await userService.acceptFamilyInvitation({
      currentUser: req.user,
      invitationId: req.params.id,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Accept Invitation Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to accept invitation",
    });
  }
};

const declineInvitation = async (req, res) => {
  try {
    const result = await userService.declineFamilyInvitation({
      currentUser: req.user,
      invitationId: req.params.id,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Decline Invitation Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to decline invitation",
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

const sendSMSInvitation = async (req, res) => {
  try {
    const result = await userService.sendSMSInvitation({
      currentUser: req.user,
      phoneNumber: req.body.phoneNumber,
      countryCode: req.body.countryCode,
      relationship: req.body.relationship,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Send SMS Invitation Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to send SMS invitation",
    });
  }
};

const createLinkInvitation = async (req, res) => {
  try {
    const result = await userService.createLinkInvitation({
      currentUser: req.user,
      relationship: req.body.relationship,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Create Link Invitation Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to create link invitation",
    });
  }
};

const createQRInvitation = async (req, res) => {
  try {
    const result = await userService.createQRInvitation({
      currentUser: req.user,
      relationship: req.body.relationship,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Create QR Invitation Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to create QR invitation",
    });
  }
};

const validateInvitationToken = async (req, res) => {
  try {
    const result = await userService.validateInvitationToken({
      token: req.query.token,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Validate Invitation Token Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to validate invitation token",
    });
  }
};

const acceptInvitationViaToken = async (req, res) => {
  try {
    const result = await userService.acceptInvitationViaToken({
      currentUser: req.user,
      token: req.body.token,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Accept Invitation Via Token Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to accept invitation via token",
    });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await userService.getUserById({
      currentUser: req.user,
      userId: req.params.id,
    });

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Get User By ID Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch user profile",
    });
  }
};

const getFamilyBadgeCount = async (req, res) => {
  try {
    const result = await userService.getFamilyBadgeCount({
      currentUser: req.user,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Get Family Badge Count Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch family badge count",
    });
  }
};

const markFamilySeen = async (req, res) => {
  try {
    const result = await userService.markFamilySeen({
      currentUser: req.user,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Mark Family Seen Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to mark family activity as seen",
    });
  }
};

const getTaggable = async (req, res) => {
  try {
    const users = await userService.getTaggableUsers({
      currentUser: req.user,
      query: req.query.q || req.query.query || "",
    });

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Get Taggable Users Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch taggable users",
    });
  }
};

module.exports = {
  getSuggested,
  getTaggable,
  getFeatured,
  getFamily,
  connectFamily,
  getInvitations,
  acceptInvitation,
  declineInvitation,
  disconnectFamily,
  follow,
  unfollow,
  getFollowers,
  getFollowing,
  heartbeat,
  sendSMSInvitation,
  createLinkInvitation,
  createQRInvitation,
  validateInvitationToken,
  acceptInvitationViaToken,
  getUserById,
  getFamilyBadgeCount,
  markFamilySeen,
};
