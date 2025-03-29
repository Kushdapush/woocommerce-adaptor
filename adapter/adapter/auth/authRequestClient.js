const axios = require('axios');
const signatureGenerator = require('./signatureGenerator');
const logger = require('../utils/logger');
const config = require('../utils/config');

/**
 * Make an authenticated request to the ONDC Network
 * @param {string} url - API endpoint URL
 * @param {Object} payload - Request payload
 * @param {Object} options - Additional request options
 * @returns {Promise<Object>} API response
 */
const makeAuthenticatedRequest = async (url, payload, options = {}) => {
  try {
    // Sign the request payload
    const { authHeader } = signatureGenerator.signRequest(payload);
    
    // Merge default headers with options
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
      ...options.headers
    };
    
    // Make the request with timeout
    const response = await axios({
      method: options.method || 'POST',
      url,
      data: payload,
      headers,
      timeout: options.timeout || 30000 // 30 seconds default timeout
    });
    
    return response.data;
  } catch (error) {
    logger.error('Error making authenticated request', { 
      url, 
      error: error.message,
      response: error.response?.data,
      status: error.response?.status 
    });
    
    throw error;
  }
};

/**
 * Send an authenticated callback to the BAP
 * @param {string} url - Callback URL (typically BAP URL)
 * @param {Object} payload - Callback payload
 * @param {string} transactionId - ONDC transaction ID for logging
 * @param {string} type - Callback type (e.g., 'on_init', 'on_confirm')
 * @returns {Promise<Object>} Result with success status
 */
const sendAuthenticatedCallback = async (url, payload, transactionId, type) => {
  const maxRetries = config.ondc?.callbackRetryCount || 3;
  const retryDelay = config.ondc?.callbackRetryDelay || 5000; // 5 seconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Sending authenticated ${type} callback (attempt ${attempt}/${maxRetries})`, {
        transactionId,
        url
      });
      
      const response = await makeAuthenticatedRequest(url, payload, {
        timeout: 30000 // 30 seconds timeout
      });
      
      logger.info(`${type} callback successful`, {
        transactionId,
        response: typeof response === 'object' ? 'Received object response' : 'Non-object response'
      });
      
      return {
        success: true,
        data: response
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
  makeAuthenticatedRequest,
  sendAuthenticatedCallback
};