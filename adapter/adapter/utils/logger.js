const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf, colorize, json } = format;

// Custom format for detailed logging
const detailedFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let metaStr = '';
  
  if (Object.keys(metadata).length > 0) {
    metaStr = JSON.stringify(metadata);
  }
  
  return `${timestamp} [${level}]: ${message} ${metaStr}`;
});

// Create different logger configurations for different environments
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    json()
  ),
  defaultMeta: { service: 'ondc-woocommerce-connector' },
  transports: [
    // Write all logs to console
    new transports.Console({
      format: combine(
        colorize(),
        timestamp(),
        detailedFormat
      )
    }),
    // Write all logs to files
    new transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5 
    }),
    new transports.File({ 
      filename: 'logs/app.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5 
    })
  ]
});

// Add request ID to log context if available
logger.requestContext = (req) => {
  if (req?.body?.context?.transaction_id) {
    return {
      transactionId: req.body.context.transaction_id,
      messageId: req.body.context.message_id,
      action: req.body.context.action
    };
  }
  return {};
};

module.exports = logger;