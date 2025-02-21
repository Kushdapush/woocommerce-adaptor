const logger = require("../utils/logger");

const handleConfirmRequest = async (req,res) => {
    try{
        const {body} = req;
        logger.info("Received request to confirm");
        res.status(200).json({message: "Confirmed"});

    } catch(error){
        logger.error(error.message, {stack: error.stack});
        res.status(500).json({error: error.message || "Internal Server Error at confirmController"});
    }
}