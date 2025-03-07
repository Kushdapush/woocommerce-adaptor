const logger = require("../utils/logger");

const handleConfirmRequest = async (req,res) => {
    try{
        const {body} = req;
        logger.info("Received request to confirm");
        const ackResponse = {
            context: {
                ...body.context,
                timestamp: new Date().toISOString()
            },
            message: {
                ack: {
                    status: "ACK"
                }
            }
        };
        res.status(200).json(ackResponse);
        logger.info("Confirm request successful");

        try{

        } catch (error){
            logger.error("Confirm request failed", {
                transactionId: body.context.transactionId,
                error: error.message
            });
            handleError(error, res);
        }

    } catch(error){
        logger.error(error.message, {stack: error.stack});
        res.status(500).json({error: error.message || "Internal Server Error at confirmController"});
    }
}