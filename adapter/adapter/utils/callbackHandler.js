const axios = require('axios');
const logger = require('./logger');
const config = require('./config');

/**
 * Send callback to BAP with retry logic
 * @param {string} url - Callback URL
 * @param {Object} payload - Callback payload
 * @param {string} transactionId - ONDC transaction ID for logging
 * @param {string} type - Callback type (e.g., 'on_init', 'on_confirm')
 * @returns {Promise<Object>} Result with success status
 */
const sendCallback = async (url, payload, transactionId, type) => {
  const maxRetries = config.ondc?.callbackRetryCount || 3;
  const retryDelay = config.ondc?.callbackRetryDelay || 5000; // 5 seconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Sending ${type} callback (attempt ${attempt}/${maxRetries})`, {
        transactionId,
        url
      });
      
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.ondc?.authToken || ''}`
        },
        timeout: 30000 // 30 seconds timeout
      });
      
      logger.info(`${type} callback successful`, {
        transactionId,
        statusCode: response.status
      });
      
      return {
        success: true,
        status: response.status,
        data: response.data
      };
    } catch (error) {
      const statusCode = error.response?.status;
      const responseData = error.response?.data;
      
      logger.error(`${type} callback failed (attempt ${attempt}/${maxRetries})`, {
        transactionId,
        error: error.message,
        statusCode,
        responseData
      });
      
      // If this is a NACK with validation error, don't retry
      if (statusCode === 400 || 
          (responseData?.error?.code && !['23001', '31001'].includes(responseData.error.code))) {
        return {
          success: false,
          status: statusCode,
          data: responseData,
          error: error.message,
          retryable: false
        };
      }
      
      // If we haven't reached max retries, wait and try again
      if (attempt < maxRetries) {
        logger.info(`Waiting ${retryDelay/1000}s before retrying...`, { transactionId });
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        return {
          success: false,
          status: statusCode,
          data: responseData,
          error: error.message,
          retryable: true
        };
      }
    }
  }
};

module.exports = {
  sendCallback
};