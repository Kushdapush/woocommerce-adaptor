const logger = require('../utils/logger');
const initService = require('../services/initService');
const { ApiError } = require('../utils/errorHandler');

const processInitRequest = async (req, res, next) => {
  const transactionId = req.body?.context?.transaction_id || 'unknown';
  
  try {
    logger.info('Received ONDC init request', { 
      transactionId,
      messageId: req.body?.context?.message_id,
      domain: req.body?.context?.domain
    });

    // Ensure request body is valid
    if (!req.body || !req.body.context || !req.body.message || !req.body.message.order) {
      throw new ApiError('Invalid request format. Missing required fields.', 400);
    }

    // Send ACK response immediately as per ONDC guidelines
    res.status(202).json({
      message: {
        ack: {
          status: "ACK"
        }
      }
    });
    
    // Process the request asynchronously
    setTimeout(async () => {
      try {
        // Process the init request
        const ondcResponse = await initService.processInit(req.body);
        
        // Send on_init callback to BAP
        const onInitService = require('../services/onInitService');
        await onInitService.sendOnInitCallback(ondcResponse);
        
        logger.info('Successfully processed init request', {
          transactionId,
          orderId: ondcResponse.message.order.id
        });
      } catch (asyncError) {
        logger.error('Async processing error for init request', {
          transactionId,
          error: asyncError.message,
          stack: asyncError.stack
        });
      }
    }, 0);
    
  } catch (error) {
    logger.error('Error processing ONDC init request', { 
      transactionId, 
      error: error.message,
      stack: error.stack
    });
    
    next(error);
  }
};

module.exports = { processInitRequest };