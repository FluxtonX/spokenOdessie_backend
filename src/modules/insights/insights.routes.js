const express = require("express");
const { protect } = require("../../middlewares/auth.middleware");
const controller = require("./insights.controller");

const router = express.Router();

router.get("/summary", protect, controller.getInsightsSummary);

module.exports = router;
