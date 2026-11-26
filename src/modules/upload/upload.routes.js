const express = require("express");
const { protect, requirePostingAccess } = require("../../middlewares/auth.middleware");
const controller = require("./upload.controller");

const router = express.Router();

router.post("/presigned-url", protect, requirePostingAccess, controller.getPresignedUrl);

module.exports = router;
