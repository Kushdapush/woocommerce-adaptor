const selectProducts = require("../services/selectService");
const handleError = require("../utils/errorHandler");
const logger = require("../utils/logger");

const handleSelectRequest = async(req , res) => {
    const {context,message} = req.body;
    const order = message.order;
    const orderId  =  order.id;
    const transactionId = context.transactionId;

    logger.info("Select request received", {orderId});
    try{
        const selectProducts = await selectService.selectProducts(order);

        const response = {};

        logger.info("Select request successful", {transactionId});
        
        res.status(200).json(response);
    } catch (error){
        logger.error("Select request failed", {transactionId, error: error.message});
        handleError(error, res);
    }

};

module.exports = {
    handleSelectRequest
}
