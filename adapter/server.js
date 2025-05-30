const express = require("express");
const bodyParser = require("body-parser");
require('dotenv').config();

const selectRoutes = require("./routes/selectRoutes");
const searchRoutes = require("./routes/searchRoutes");
const statusRoutes = require("./routes/statusRoutes");
const updateRoutes = require("./routes/updateRoutes");

const logger = require("./utils/logger");

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use((req, res, next) => {
  logger.info(`Received ${req.method} request for ${req.url}`);
  next();
});

app.use("/search", searchRoutes);
app.use("/select", selectRoutes);
app.use("/status", statusRoutes);
app.use("/update", updateRoutes);

app.use((err, req, res, next) => {
  logger.error(err.message, { stack: err.stack });
  res
    .status(err.status || 500)
    .json({ error: err.message || "Internal Server Error" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => logger.info(`Server is running on port ${PORT}`));