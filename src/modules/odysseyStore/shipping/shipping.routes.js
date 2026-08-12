const express = require("express");
const controller = require("./shipping.controller");

const router = express.Router();

router.post("/calculate", controller.calculateShipping);

module.exports = router;
