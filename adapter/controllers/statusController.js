const logger = require("../utils/logger");
const handleError = require("../utils/errorHandler");
const { sendOnStatusResponse } = require("../services/statusService");

const handleStatusRequest = async (req, res) => {
  const { context, message } = req.body;
  
  try {
    logger.info("Status request received", { 
      transactionId: context.transaction_id,
      orderId: message.order_id
    });
    
    const ackResponse = {
      context: {
        ...context,
        timestamp: new Date().toISOString()
      },
      message: {
        ack: {
          status: "ACK"
        }
      }
    };

    res.status(200).json(ackResponse);
    
    try {
      await sendOnStatusResponse(context, message);
      logger.info("Status response sent to BAP", { 
        transactionId: context.transaction_id,
        orderId: message.order_id
      });
    } catch (error) {
      logger.error("Failed to send status response to BAP", { 
        transactionId: context.transaction_id,
        orderId: message.order_id,
        error: error.message,
        stack: error.stack
      });
    }
  } catch (error) {
    handleError(res, error, "Error processing /status request");
  }
};

module.exports = {
  handleStatusRequest
};