const logger = require("../utils/logger");
const handleError = require("../utils/errorHandler");
const { sendOnStatusResponse, getLocalOnStatusResponse } = require("../services/statusService");

const handleStatusRequest = async (req, res) => {
  const { context, message } = req.body;
  
  try {
    logger.info("Status request received", { 
      transactionId: context.transaction_id,
      orderId: message.order_id
    });
    
    // Send immediate acknowledgement
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
    
    // DEVELOPMENT MODE: Generate and log the response
    try {
      // Generate the response without sending it
      const onStatusResponse = await getLocalOnStatusResponse(context, message);
      
      // Format and log the response for better readability
      console.log("\n===== ON_STATUS RESPONSE START =====");
      console.log(JSON.stringify(onStatusResponse, null, 2));
      console.log("===== ON_STATUS RESPONSE END =====\n");
      
      logger.info("Generated on_status response (not sent to BAP)", { 
        transactionId: context.transaction_id,
        orderId: message.order_id
      });
      
      // PRODUCTION MODE (Commented out):
      // await sendOnStatusResponse(context, message);
      // logger.info("Status response sent to BAP", { 
      //   transactionId: context.transaction_id,
      //   orderId: message.order_id
      // });
    } catch (error) {
      logger.error("Failed to generate status response", { 
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