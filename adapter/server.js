const express = require("express");
const bodyParser = require("body-parser");
require('dotenv').config();

const selectRoutes = require("./routes/selectRoutes");
const searchRoutes = require("./routes/searchRoutes");
const confirmRoutes = require("./routes/confirmRoutes");

const logger = require("./utils/logger");

const app = express();

app.use(bodyParser.json());

app.use("/search", searchRoutes);
app.use("/select", selectRoutes);
app.use("/confirm", confirmRoutes);

app.use((err, req, res, next) => {
  logger.error(err.message, { stack: err.stack });
  res
    .status(err.status || 500)
    .json({ error: err.message || "Internal Server Error" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => logger.info(`Server is running on port ${PORT}`));