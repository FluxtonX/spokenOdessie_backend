const express = require("express");
const router = express.Router();
const { protect } = require("../../middlewares/auth.middleware");
const {
  getUserNotifications,
  markNotificationAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount
} = require("./notification.service");

// Get all notifications for the authenticated user
router.get("/", protect, async (req, res) => {
  try {
    const { unreadOnly, limit } = req.query;
    const notifications = await getUserNotifications({
      userId: req.user.id,
      unreadOnly: unreadOnly === 'true',
      limit: parseInt(limit) || 50
    });
    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get unread notification count
router.get("/unread-count", protect, async (req, res) => {
  try {
    const count = await getUnreadCount({ userId: req.user.id });
    res.json({ success: true, data: { count } });
  } catch (error) {
    console.error("Get unread count error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark a notification as read
router.patch("/:id/read", protect, async (req, res) => {
  try {
    const { id } = req.params;
    await markNotificationAsRead({ notificationId: id, userId: req.user.id });
    res.json({ success: true, message: "Notification marked as read" });
  } catch (error) {
    console.error("Mark notification as read error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark all notifications as read
router.patch("/read-all", protect, async (req, res) => {
  try {
    await markAllAsRead({ userId: req.user.id });
    res.json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    console.error("Mark all as read error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a notification
router.delete("/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    await deleteNotification({ notificationId: id, userId: req.user.id });
    res.json({ success: true, message: "Notification deleted" });
  } catch (error) {
    console.error("Delete notification error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Register device push token
router.post("/device-token", protect, async (req, res) => {
  try {
    const { token, deviceType } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: "Device token is required" });
    }
    const { registerDeviceToken } = require("../../services/pushNotification.service");
    const record = await registerDeviceToken({ userId: req.user.id, token, deviceType });
    res.json({ success: true, data: record });
  } catch (error) {
    console.error("Register device token error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Unregister device push token
router.delete("/device-token", protect, async (req, res) => {
  try {
    const { token } = req.body;
    const { unregisterDeviceToken } = require("../../services/pushNotification.service");
    await unregisterDeviceToken({ userId: req.user.id, token });
    res.json({ success: true, message: "Device token unregistered" });
  } catch (error) {
    console.error("Unregister device token error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
