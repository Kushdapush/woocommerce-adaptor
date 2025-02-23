const express = require("express");
const router = express.Router();
const initController = require("../controllers/initController");

// Init API route
router.post("/", initController.handleInitRequest);

module.exports = router;
