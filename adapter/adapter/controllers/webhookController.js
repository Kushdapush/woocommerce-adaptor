const logger = require('../utils/logger');

const handleOnInit = async (req, res) => {
  try {
    logger.info('Received on_init callback', {
      transactionId: req.body?.context?.transaction_id,
      messageId: req.body?.context?.message_id
    });

    res.status(200).json({
      message: {
        ack: { status: "ACK" }
      }
    });
  } catch (error) {
    logger.error('Error handling on_init callback', { error });
    res.status(500).json({
      message: {
        ack: { status: "NACK" }
      }
    });
  }
};

module.exports = {
  handleOnInit
};