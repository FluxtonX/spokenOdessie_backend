const express = require("express");
const router = express.Router();
const { handleChatQuery, getStatus } = require("./aiHistorian.controller");
const { protect } = require("../../middlewares/auth.middleware");

router.post("/chat", protect, handleChatQuery);
router.get("/status", protect, getStatus);

module.exports = router;
