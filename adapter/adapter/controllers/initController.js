/**
 * ONDC Init API Controller
 * Handles the init API requests
 */

const initService = require('../services/initService');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');
const { initRequestSchema } = require('../models/init');

/**
 * Process ONDC init request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const processInitRequest = async (req, res, next) => {
  try {
    logger.info('Processing ONDC init request', { transactionId: req.body.context.transaction_id });
    
    // Validate request body using Joi schema
    const { error } = initRequestSchema.validate(req.body, { abortEarly: false });
    if (error) {
      throw new ApiError(`Validation error: ${error.details.map(detail => detail.message).join(', ')}`, 400);
    }
    
    // Process the init request
    const response = await initService.processInit(req.body);
    
    // Send response
    res.json(response);
    logger.info('ONDC init request processed successfully', { 
      transactionId: req.body.context.transaction_id,
      messageId: response.context.message_id
    });
  } catch (error) {
    logger.error('Error processing ONDC init request', { 
      error: error.message, 
      transactionId: req.body?.context?.transaction_id
    });
    next(error);
  }
};

module.exports = {
  processInitRequest
};

