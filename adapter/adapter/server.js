const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./utils/config');
const logger = require('./utils/logger');
const { errorHandler } = require('./utils/errorHandler');

// Import routes
const searchRoutes = require('./routes/searchRoutes');
const selectRoutes = require('./routes/selectRoutes');
const initRoutes = require('./routes/initRoutes');
const onInitRoutes = require('./routes/onInitRoutes');
const confirmRoutes = require('./routes/confirmRoutes');
const onConfirmRoutes = require('./routes/onConfirmRoutes');
const productRoutes = require('./routes/productRoutes');

// Initialize Express app
const app = express();

// Apply middlewares
app.use(helmet());
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// API routes
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/select', selectRoutes);
app.use('/api/v1/init', initRoutes);
app.use('/api/v1/on_init', onInitRoutes);
app.use('/api/v1/confirm', confirmRoutes);
app.use('/api/v1/on_confirm', onConfirmRoutes);
app.use('/api/v1/products', productRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Error handling middleware
app.use(errorHandler);

// Start the server
const PORT = config.server.port || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`ONDC Connector initialized with endpoints:`);
  logger.info(`- /api/v1/search`);
  logger.info(`- /api/v1/select`);
  logger.info(`- /api/v1/init`);
  logger.info(`- /api/v1/on_init`);
  logger.info(`- /api/v1/confirm`);
  logger.info(`- /api/v1/on_confirm`);
  logger.info(`- /api/v1/products`);
});

module.exports = app;