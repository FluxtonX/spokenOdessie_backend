const express = require("express");
const { protect } = require("../../middlewares/auth.middleware");
const controller = require("./upload.controller");

const router = express.Router();

router.post("/presigned-url", protect, controller.getPresignedUrl);

module.exports = router;
