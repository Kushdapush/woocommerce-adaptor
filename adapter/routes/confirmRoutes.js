const express = require("express");
const router = express.Router();
const confirmController = require("../controllers/confirmController");

router.post("/", confirmController.handleConfirmRequest);

module.exports = router;