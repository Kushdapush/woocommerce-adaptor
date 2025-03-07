const axios = require("axios");
const logger = require("./logger");

/**
 * 
 * @param {string} method - HTTP method (get, post, put, etc.)
 * @param {string} url - The target URL
 * @param {object} data - Request payload for POST/PUT
 * @param {object} headers - Request headers
 * @param {string} transactionId - ONDC transaction ID for logging
 * @returns {Promise} - Response data
 */
const makeRequest = async (method, url, data = null, headers = {}, transactionId = null) => {
  try {
    const config = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      ...(data && { data })
    };
    
    logger.info(`Making ${method.toUpperCase()} request to ${url}`, { transactionId });
    
    const response = await axios(config);
    
    logger.info(`Request to ${url} successful`, { 
      transactionId,
      status: response.status 
    });
    
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const responseData = error.response?.data;
    
    logger.error(`Request to ${url} failed`, {
      transactionId,
      status,
      error: error.message,
      responseData
    });
    
    throw error;
  }
};

module.exports = {
  makeRequest
};