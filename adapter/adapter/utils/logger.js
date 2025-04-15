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
  level: 'info',
  format: combine(
    timestamp(),
    json()
  ),
  transports: [
    new transports.Console({
      format: format.simple()
    })
  ]
});

module.exports = logger;