const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./utils/config');
const logger = require('./utils/logger');
const { errorHandler } = require('./utils/errorHandler');
const { verifyAuthentication } = require('./auth/authMiddleware');

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

// Apply security middleware
app.use(helmet());
app.use(cors());

// Custom middleware to capture raw body for signature verification
app.use((req, res, next) => {
  let rawBody = '';
  
  // Skip for non-JSON requests
  if (req.headers['content-type'] !== 'application/json') {
    return next();
  }
  
  req.on('data', (chunk) => {
    rawBody += chunk.toString();
  });
  
  req.on('end', () => {
    req.rawBody = rawBody;
    next();
  });
});

// Apply standard middleware
app.use(bodyParser.json({ 
  limit: config.server.bodyLimit,
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(bodyParser.urlencoded({ 
  extended: true, 
  limit: config.server.bodyLimit 
}));
app.use(morgan('combined', { 
  stream: { 
    write: message => logger.info(message.trim()) 
  } 
}));

// Apply authentication middleware if enabled
if (config.server.enableAuthentication) {
  app.use(verifyAuthentication);
  logger.info('ONDC Authentication middleware enabled');
} else {
  logger.warn('ONDC Authentication middleware is DISABLED - not recommended for production');
}

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