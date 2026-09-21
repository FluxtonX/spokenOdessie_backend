const express = require("express");
const router = express.Router();
const dashboardService = require("./dashboard.service");
const { protect } = require("../../middlewares/auth.middleware");

/**
 * GET /api/dashboard/home
 * High-performance aggregated home dashboard data in a single network roundtrip.
 */
router.get("/home", protect, async (req, res) => {
  try {
    const data = await dashboardService.getHomeDashboard({
      currentUser: req.user,
    });
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to load dashboard data",
    });
  }
});

module.exports = router;
