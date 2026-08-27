const legacyAccessService = require("./legacyAccess.service");

const getLegacySettings = async (req, res) => {
  try {
    const settings = await legacyAccessService.getOrCreateLegacySettings({
      currentUser: req.user
    });
    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error("Get Legacy Settings Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch legacy settings"
    });
  }
};

const updateLegacySettings = async (req, res) => {
  try {
    const updated = await legacyAccessService.updateLegacySettings({
      currentUser: req.user,
      data: req.body
    });
    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error("Update Legacy Settings Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to update legacy settings"
    });
  }
};

const requestVaultRelease = async (req, res) => {
  try {
    const { legacyUserId, reason } = req.body;
    const request = await legacyAccessService.requestVaultRelease({
      currentUser: req.user,
      legacyUserId: legacyUserId || req.user.id,
      reason
    });
    res.status(200).json({
      success: true,
      data: request
    });
  } catch (error) {
    console.error("Request Vault Release Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to request vault release"
    });
  }
};

const approveVaultRelease = async (req, res) => {
  try {
    const { requestId } = req.params;
    const updatedSettings = await legacyAccessService.approveVaultRelease({
      currentUser: req.user,
      requestId
    });
    res.status(200).json({
      success: true,
      data: updatedSettings
    });
  } catch (error) {
    console.error("Approve Vault Release Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to approve vault release"
    });
  }
};

const rejectVaultRelease = async (req, res) => {
  try {
    const { requestId } = req.params;
    const updated = await legacyAccessService.rejectVaultRelease({
      currentUser: req.user,
      requestId,
      reason: req.body.reason
    });
    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error("Reject Vault Release Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to reject vault release"
    });
  }
};

const getVaultMemories = async (req, res) => {
  try {
    const memories = await legacyAccessService.getVaultMemories({
      currentUser: req.user,
      targetUserId: req.query.userId
    });
    res.status(200).json({
      success: true,
      data: memories
    });
  } catch (error) {
    console.error("Get Vault Memories Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch vault memories"
    });
  }
};

const getFamilyCircleVaults = async (req, res) => {
  try {
    const vaults = await legacyAccessService.getFamilyCircleVaults({
      currentUser: req.user,
      familyCircleId: req.query.familyCircleId
    });
    res.status(200).json({
      success: true,
      data: vaults
    });
  } catch (error) {
    console.error("Get Family Circle Vaults Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch family circle vaults"
    });
  }
};

const getPendingVaultRequests = async (req, res) => {
  try {
    const pending = await legacyAccessService.getPendingVaultRequestsForAdmin({
      currentUser: req.user,
      familyCircleId: req.query.familyCircleId
    });
    res.status(200).json({
      success: true,
      data: pending
    });
  } catch (error) {
    console.error("Get Pending Vault Requests Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch pending vault requests"
    });
  }
};

module.exports = {
  getLegacySettings,
  updateLegacySettings,
  requestVaultRelease,
  approveVaultRelease,
  rejectVaultRelease,
  getVaultMemories,
  getFamilyCircleVaults,
  getPendingVaultRequests
};
