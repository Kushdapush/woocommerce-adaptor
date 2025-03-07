const logger = require("../utils/logger");
const handleError = require("../utils/errorHandler");
const { sendOnSearchResponse } = require("../services/searchService");

const handleSearchRequest = async (req, res) => {
  const { context, message } = req.body;
  
  try {
    logger.info("Search request received", { transactionId: context.transaction_id });
    
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
      await sendOnSearchResponse(context, message);
      logger.info("Search response sent to BAP", { transactionId: context.transaction_id });
    } catch (error) {
      logger.error("Failed to send search response to BAP", { 
        transactionId: context.transaction_id,
        error: error.message,
        stack: error.stack
      });
    }
  } catch (error) {
    handleError(res, error, "Error processing /search request");
  }
};

module.exports = { handleSearchRequest };