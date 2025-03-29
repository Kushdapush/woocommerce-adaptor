const cancelService = require('../services/cancelService');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');
const { cancelRequestSchema } = require('../models/cancel');

/**
 * Process ONDC cancel request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const processCancelRequest = async (req, res, next) => {
  const transactionId = req.body?.context?.transaction_id || 'unknown';
  const messageId = req.body?.context?.message_id || 'unknown';
  
  try {
    logger.info('Received ONDC cancel request', { 
      transactionId,
      messageId,
      domain: req.body?.context?.domain,
      city: req.body?.context?.city
    });
    
    // Validate request body using Joi schema
    const { error } = cancelRequestSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errorMessages = error.details.map(detail => detail.message).join(', ');
      logger.warn('Validation error in cancel request', { 
        transactionId,
        error: errorMessages
      });
      throw new ApiError(`Validation error: ${errorMessages}`, 400);
    }
    
    logger.info('Cancel request validation passed, processing request', { transactionId });
    
    // Send ACK response immediately
    res.status(202).json({
      message: {
        ack: {
          status: "ACK"
        }
      }
    });
    
    // Process the cancel request asynchronously
    processCancelAsync(req.body)
      .catch(error => {
        logger.error('Unhandled error in async cancel processing', {
          transactionId,
          error: error.message,
          stack: error.stack
        });
      });
    
  } catch (error) {
    logger.error('Error processing ONDC cancel request', { 
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
 * Process cancel request asynchronously
 * @param {Object} request - ONDC cancel request
 * @returns {Promise<void>}
 */
const processCancelAsync = async (request) => {
  const { context } = request;
  const transactionId = context.transaction_id;
  const orderId = request.message.order_id;
  const cancellationReasonId = request.message.cancellation_reason_id;
  const fulfillmentId = request.message.descriptor.short_desc;
  
  try {
    logger.info('Starting async processing of cancel request', { 
      transactionId, 
      orderId,
      cancellationReasonId,
      fulfillmentId
    });
    
    // Validate the cancellation
    const validationResult = await cancelService.validateCancellation(
      orderId, 
      cancellationReasonId, 
      fulfillmentId,
      context
    );
    
    if (!validationResult.valid) {
      logger.warn('Cancellation validation failed', {
        transactionId,
        orderId,
        reason: validationResult.reason
      });
      
      // For validation failures like invalid reason code or no TAT breach,
      // we don't need to send a callback as the ACK was already sent.
      // The BAP should be aware of the validation error from validationResult.errorCode.
      return;
    }
    
    // Process the cancellation
    const ondcResponse = await cancelService.processCancellation(
      orderId,
      cancellationReasonId,
      fulfillmentId,
      context
    );
    
    logger.info('Successfully processed cancel request, sending on_cancel callback', { 
      transactionId,
      orderId,
      cancellationReasonId
    });
    
    // Send the on_cancel callback
    const callbackResult = await cancelService.sendOnCancelCallback(ondcResponse);
    
    logger.info('Completed async processing of cancel request', { 
      transactionId,
      callbackSuccess: callbackResult
    });
  } catch (error) {
    logger.error('Error in async processing of cancel request', {
      transactionId,
      orderId,
      error: error.message,
      stack: error.stack
    });
  }
};

module.exports = {
  processCancelRequest
};