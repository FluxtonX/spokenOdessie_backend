const express = require("express");
const { protect } = require("../../middlewares/auth.middleware");
const controller = require("./search.controller");

const router = express.Router();

router.get("/", protect, controller.searchArchive);

module.exports = router;
