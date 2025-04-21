const vLookUp = require("vlookup-ondc");
const logger = require('../utils/logger');

async function performVLookup() {
    try {
        const result = await vLookUp({
            senderSubscriberId: "woocommerce-test-adaptor.ondc.org",
            privateKey: process.env.ONDC_SIGNING_PRIVATE_KEY || "u51ta3OC9sqCauHjLRnqUtWFdPzftn8QgC8q7norEBUEA9uDB2XU+DuDJjItKq1pTNDEGrSXLWTY3mT/xx3JBQ==", // Get from env var

            // Search parameters
            domain: "ONDC:RET10",
            subscriberId: "woocommerce-test-adaptor.ondc.org",
            country: "IND",
            type: "sellerApp",
            city: "std:080",
            env: "staging.registry.ondc.org"
        });

        logger.info('VLookup successful', {
            result: JSON.stringify(result)
        });

        return result;
    } catch (error) {
        // Handle specific error codes
        if (error.response) {
            const statusCode = error.response.status;
            switch (statusCode) {
                case 412:
                    logger.error('Precondition failed - Invalid request parameters', {
                        error: error.message,
                        details: error.response.data
                    });
                    break;
                case 401:
                    logger.error('Unauthorized - Check your private key', {
                        error: error.message
                    });
                    break;
                case 404:
                    logger.error('Subscriber not found in registry', {
                        error: error.message
                    });
                    break;
                default:
                    logger.error(`VLookup failed with status ${statusCode}`, {
                        error: error.message,
                        response: error.response.data
                    });
            }
        } else {
            logger.error('VLookup failed', {
                error: error.message,
                stack: error.stack
            });
        }
        throw error;
    }
}

// Execute if run directly
if (require.main === module) {
    performVLookup()
        .then(result => {
            console.log('VLookup Result:', result);
        })
        .catch(error => {
            console.error('VLookup Error:', {
                code: error.response?.status,
                message: error.message
            });
            process.exit(1);
        });
}

module.exports = performVLookup;