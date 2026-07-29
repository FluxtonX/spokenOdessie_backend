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

module.exports = {
  getLegacySettings,
  updateLegacySettings
};
