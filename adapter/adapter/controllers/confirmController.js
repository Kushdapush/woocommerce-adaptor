const confirmService = require('../services/confirmService');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');
const { confirmRequestSchema } = require('../models/confirm');

/**
 * Process ONDC confirm request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const processConfirmRequest = async (req, res, next) => {
  const transactionId = req.body?.context?.transaction_id || 'unknown';
  const messageId = req.body?.context?.message_id || 'unknown';
  
  try {
    logger.info('Received ONDC confirm request', { 
      transactionId,
      messageId,
      domain: req.body?.context?.domain,
      city: req.body?.context?.city
    });
    
    // Validate request body using Joi schema
    const { error } = confirmRequestSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errorMessages = error.details.map(detail => detail.message).join(', ');
      logger.warn('Validation error in confirm request', { 
        transactionId,
        error: errorMessages
      });
      throw new ApiError(`Validation error: ${errorMessages}`, 400);
    }
    
    logger.info('Confirm request validation passed, processing request', { transactionId });
    
    // Send ACK response immediately
    res.status(202).json({
      message: {
        ack: {
          status: "ACK"
        }
      }
    });
    
    // Process the confirm request asynchronously
    processConfirmAsync(req.body)
      .catch(error => {
        logger.error('Unhandled error in async confirm processing', {
          transactionId,
          error: error.message,
          stack: error.stack
        });
      });
    
  } catch (error) {
    logger.error('Error processing ONDC confirm request', { 
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
 * Process confirm request asynchronously
 * @param {Object} request - ONDC confirm request
 * @returns {Promise<void>}
 */
const processConfirmAsync = async (request) => {
  const { context } = request;
  const transactionId = context.transaction_id;
  
  try {
    // Add request validation timestamp
    const startTime = Date.now();
    logger.info('Starting async processing of confirm request', { 
      transactionId,
      startTime 
    });
    
    // Add timeout handling
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Confirm processing timeout')), 30000);
    });

    // Process with timeout
    const ondcResponse = await Promise.race([
      confirmService.processConfirm(request),
      timeoutPromise
    ]);

    // Add performance metrics
    const processingTime = Date.now() - startTime;
    logger.info('Successfully processed confirm request', { 
      transactionId,
      processingTime,
      ondcOrderId: ondcResponse.message.order.id
    });
    
    // Send the on_confirm callback
    const callbackResult = await confirmService.sendOnConfirmCallback(ondcResponse);
    
    logger.info('Completed async processing of confirm request', { 
      transactionId,
      callbackSuccess: callbackResult
    });
  } catch (error) {
    // Add error categorization
    const errorType = error.message.includes('timeout') ? 'TIMEOUT' : 
                     error.message.includes('validation') ? 'VALIDATION' : 
                     'PROCESSING';
    
    logger.error('Error in async processing of confirm request', {
      transactionId,
      errorType,
      error: error.message,
      stack: error.stack
    });
    
    // Implement order cancellation if processing fails
    if (error.message.includes('validation')) {
      await confirmService.cancelOrder(context, '999', 'Order cancelled because of order confirmation failure');
    }
  }
};

module.exports = {
  processConfirmRequest
};