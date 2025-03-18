/**
 * ONDC Init API Controller
 * Handles the init API requests
 */

const initService = require('../services/initService');
const onInitService = require('../services/oninitService');
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
  const transactionId = req.body?.context?.transaction_id || 'unknown';
  const messageId = req.body?.context?.message_id || 'unknown';
  
  try {
    logger.info('Received ONDC init request', { 
      transactionId,
      messageId,
      domain: req.body?.context?.domain,
      city: req.body?.context?.city
    });
    
    // Validate request body using Joi schema
    const { error } = initRequestSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errorMessages = error.details.map(detail => detail.message).join(', ');
      logger.warn('Validation error in init request', { 
        transactionId,
        error: errorMessages
      });
      throw new ApiError(`Validation error: ${errorMessages}`, 400);
    }
    
    logger.info('Init request validation passed, processing request', { transactionId });
    
    // Send ACK response immediately
    res.status(202).json({
      message: {
        ack: {
          status: "ACK"
        }
      }
    });
    
    // Process the init request asynchronously
    processInitAsync(req.body)
      .catch(error => {
        logger.error('Unhandled error in async init processing', {
          transactionId,
          error: error.message,
          stack: error.stack
        });
      });
    
  } catch (error) {
    logger.error('Error processing ONDC init request', { 
      transactionId, 
      error: error.message,
      stack: error.stack
    });
    
    // If it's not an ApiError, convert it to one with a 500 status code
    if (!error.status) {
      error = new ApiError(`Internal server error: ${error.message}`, 500);
    }
    
    next(error);
  }
};

/**
 * Process init request asynchronously and send callback
 * @param {Object} request - ONDC init request
 * @returns {Promise<void>}
 */
const processInitAsync = async (request) => {
  const { context } = request;
  const transactionId = context.transaction_id;
  
  try {
    logger.info('Starting async processing of init request', { transactionId });
    
    // Process the init request
    const ondcResponse = await initService.processInit(request);
    
    logger.info('Successfully processed init request, sending on_init callback', { 
      transactionId,
      ondcOrderId: ondcResponse.message.order.id
    });
    
    // Send the on_init callback
    const callbackResult = await onInitService.sendOnInitCallback(ondcResponse);
    
    logger.info('Completed async processing of init request', { 
      transactionId,
      callbackSuccess: callbackResult
    });
  } catch (error) {
    logger.error('Error in async processing of init request', {
      transactionId,
      error: error.message,
      stack: error.stack
    });
    
    // TODO: Implement retry mechanism for failed callbacks
    // This could be done using a queue system or scheduled retries
  }
};

module.exports = {
  processInitRequest
};