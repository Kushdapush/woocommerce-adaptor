const selectProducts = require("../services/selectService");
const handleError = require("../utils/errorHandler");
const logger = require("../utils/logger");

const handleSelectRequest = async (req, res) => {
  const { context, message } = req.body;
  const order = message.order;
  const orderId = order.id;
  const transactionId = context.transactionId;

  try {
    logger.info("Select request received", { orderId });
    const ackResponse = {
      context: {
        ...context,
        timestamp: new Date().toISOString(),
      },
      message: {
        ack: {
          status: "ACK",
        },
      },
    };
    res.status(200).json(ackResponse);
    logger.info("Select request successful", { transactionId });

    try {
      const selectProducts = await selectService.selectProducts(order);

      const response = {};

    } catch (error) {
      logger.error("Select request failed", {
        transactionId,
        error: error.message,
      });
      handleError(error, res);
    }
  } catch (error) {
    logger.error("Select request failed", {
      transactionId,
      error: error.message,
    });
    handleError(error, res);
  }
};

module.exports = {
  handleSelectRequest,
};

/*
The role of /on_select is to provide the entire breakup of all the prices including item, delivery, packaging etc. This is done after checking the availability and serviceability of the product.
 
*/
