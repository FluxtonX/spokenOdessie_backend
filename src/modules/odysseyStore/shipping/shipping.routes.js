const express = require("express");
const controller = require("./shipping.controller");

const router = express.Router();

router.post("/calculate", controller.calculateShipping);
router.post("/webhook", controller.handleWebhook);

module.exports = router;
