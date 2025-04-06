const initService = require('../services/initService');
const onInitService = require('../services/onInitService');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');
const { initRequestSchema } = require('../models/initModel');

// Mock helper functions (you'll need to implement these)
const checkItemAvailability = async (items) => {
  // Implement actual item availability check
  return items.map(item => ({
    ...item,
    price: {
      currency: 'INR',
      value: '500.00'
    }
  }));
};

const calculateQuote = (availableItems) => {
  const itemTotal = availableItems.reduce((sum, item) => 
    sum + parseFloat(item.price.value), 0);
  
  return {
    price: {
      currency: 'INR',
      value: (itemTotal + 50).toFixed(2)
    },
    breakup: [
      {
        title: 'Item Price',
        price: {
          currency: 'INR',
          value: itemTotal.toFixed(2)
        }
      },
      {
        title: 'Delivery Charges',
        price: {
          currency: 'INR',
          value: '50.00'
        }
      }
    ]
  };
};

const sendOnInitCallback = async (onInitResponse) => {
  try {
    // Implement actual callback logic
    logger.info('Sending on_init callback', { response: onInitResponse });
    // Example: use axios to send callback to BAP
    // await axios.post(context.bap_uri, onInitResponse);
  } catch (error) {
    logger.error('Error sending on_init callback', error);
  }
};

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
    // Log the full incoming request for debugging
    logger.info('Received ONDC init request', { 
      transactionId,
      messageId,
      domain: req.body?.context?.domain,
      city: req.body?.context?.city,
      fullPayload: JSON.stringify(req.body)
    });

    // Log the raw body for debugging
    logger.info('Received raw request body', { 
      rawBody: req.rawBody,
      parsedBody: req.body 
    });

    // Validate that the body is not empty
    if (!req.body || Object.keys(req.body).length === 0) {
      throw new ApiError('Invalid or empty request body', 400);
    }

    // Validate request body using Joi schema
    const { error } = initRequestSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errorMessages = error.details.map(detail => detail.message).join(', ');
      logger.warn('Validation error in init request', { 
        transactionId,
        error: errorMessages
      });
      
      // Throw a specific API error for validation failures
      throw new ApiError(`Validation error: ${errorMessages}`, 400);
    }
    
    logger.info('Init request validation passed, processing request', { transactionId });

    // Validate context
    const { context, message } = req.body;
    if (!context || !context.action || context.action !== 'init') {
      throw new ApiError('Invalid context', 400);
    }

    // Validate message
    if (!message || !message.order) {
      throw new ApiError('Invalid message structure', 400);
    }
    
    // Send ACK response immediately
    res.status(202).json({
      message: {
        ack: {
          status: "ACK"
        }
      }
    });
    
    // Process the init request asynchronously
    setTimeout(async () => {
      try {
        // Validate items availability
        const availableItems = await checkItemAvailability(message.order.items);

        // Generate response
        const onInitResponse = {
          context: {
            ...context,
            action: "on_init",
            timestamp: new Date().toISOString()
          },
          message: {
            order: {
              provider: {
                id: context.bpp_id,
                descriptor: {
                  name: "WooCommerce Store"
                }
              },
              items: availableItems,
              quote: calculateQuote(availableItems),
              fulfillments: [
                {
                  id: "fulfillment-1",
                  type: "Delivery",
                  "@ondc/org/TAT": "PT1H",
                  state: {
                    descriptor: {
                      code: "Serviceable"
                    }
                  }
                }
              ],
              payments: [
                {
                  type: "ON-ORDER",
                  status: "NOT-PAID",
                  collected_by: "BAP"
                }
              ]
            }
          }
        };

        // Send callback to BAP
        await sendOnInitCallback(onInitResponse);
      } catch (asyncError) {
        logger.error('Async init processing error', asyncError);
      }
    }, 0);
    
  } catch (error) {
    logger.error('Error processing ONDC init request', { 
      transactionId, 
      error: error.message,
      stack: error.stack,
      fullError: JSON.stringify(error),
      rawBody: req.rawBody
    });
    
    // If it's not an ApiError, convert it to one with a 500 status code
    if (!error.status) {
      error = new ApiError(`Internal server error: ${error.message}`, 500);
    }
    
    next(error);
  }
};

module.exports = {
  processInitRequest
};