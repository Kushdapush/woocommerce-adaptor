const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../utils/config');
const NodeCache = require('node-cache');

// Create a cache for registry data with TTL of 1 hour
// This reduces load on the registry and improves performance
const registryCache = new NodeCache({ 
  stdTTL: 3600, // Cache TTL in seconds (1 hour)
  checkperiod: 600 // Check for expired keys every 10 minutes
});

/**
 * Look up a subscriber in the ONDC Registry
 * @param {string} subscriberId - ONDC subscriber ID
 * @param {string} ukId - Unique key ID
 * @returns {Promise<Object|null>} Subscriber details or null if not found
 */
const lookupSubscriber = async (subscriberId, ukId) => {
  try {
    // Check cache first
    const cacheKey = `${subscriberId}:${ukId}`;
    const cachedData = registryCache.get(cacheKey);
    
    if (cachedData) {
      logger.debug('Retrieved subscriber from cache', { subscriberId, ukId });
      return cachedData;
    }
    
    // If not in cache, lookup from registry
    logger.info('Looking up subscriber in registry', { subscriberId, ukId });
    
    const response = await axios.post(`${config.ondc.registryUrl}/lookup`, {
      subscriber_id: subscriberId,
      ukId: ukId,
      // Optional filters if needed:
      domain: config.ondc.domain,
      country: config.ondc.country,
      city: "std:080", // This can be made dynamic based on your requirements
      type: "BPP" // Adjust based on your use case (BPP/BAP)
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000 // 5 seconds timeout
    });
    
    if (response.status !== 200 || !response.data || !Array.isArray(response.data) || response.data.length === 0) {
      logger.warn('Subscriber not found in registry', { subscriberId, ukId });
      return null;
    }
    
    // Find the entry with matching ukId
    const subscriberData = response.data.find(entry => entry.ukId === ukId);
    
    if (!subscriberData) {
      logger.warn('Subscriber ukId not found in registry response', { subscriberId, ukId });
      return null;
    }
    
    // Cache the result
    registryCache.set(cacheKey, subscriberData);
    
    return subscriberData;
  } catch (error) {
    logger.error('Error looking up subscriber in registry', { 
      subscriberId, 
      ukId, 
      error: error.message,
      response: error.response?.data
    });
    
    // In case of errors, it's safer to fail the authentication
    return null;
  }
};

/**
 * Verify lookup against the registry using vLookup endpoint
 * This is a more secure option that signs the request
 * @param {string} subscriberId - Target subscriber ID to look up
 * @returns {Promise<Object|null>} Subscriber details or null if not found
 */
const verifyLookup = async (subscriberId) => {
  try {
    const timestamp = new Date().toISOString();
    
    // Prepare the vLookup request
    const vLookupRequest = {
      sender_subscriber_id: config.ondc.subscriberId,
      request_id: `req-${Date.now()}`,
      timestamp: timestamp,
      search_parameters: {
        domain: config.ondc.domain,
        subscriber_id: subscriberId,
        country: config.ondc.country,
        type: "BPP", // Adjust based on your use case
        city: "std:080" // This can be made dynamic
      }
    };
    
    // In a production implementation, you would sign this request with your private key
    // vLookupRequest.signature = signRequest(vLookupRequest, privateKey);
    
    const response = await axios.post(`${config.ondc.registryUrl}/vlookup`, vLookupRequest, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000 // 5 seconds timeout
    });
    
    if (response.status !== 200 || !response.data || !response.data.subscriber) {
      logger.warn('vLookup failed for subscriber', { subscriberId });
      return null;
    }
    
    return response.data.subscriber;
  } catch (error) {
    logger.error('Error performing vLookup', { 
      subscriberId, 
      error: error.message,
      response: error.response?.data
    });
    
    return null;
  }
};

/**
 * Refresh the registry cache for a specific subscriber
 * @param {string} subscriberId - ONDC subscriber ID
 * @param {string} ukId - Unique key ID
 * @returns {Promise<boolean>} Success status
 */
const refreshSubscriberCache = async (subscriberId, ukId) => {
  try {
    const cacheKey = `${subscriberId}:${ukId}`;
    registryCache.del(cacheKey);
    
    const subscriber = await lookupSubscriber(subscriberId, ukId);
    return !!subscriber;
  } catch (error) {
    logger.error('Error refreshing subscriber cache', { 
      subscriberId, 
      ukId, 
      error: error.message 
    });
    return false;
  }
};

/**
 * Clear the entire registry cache
 */
const clearCache = () => {
  registryCache.flushAll();
  logger.info('Registry cache cleared');
};

module.exports = {
  lookupSubscriber,
  verifyLookup,
  refreshSubscriberCache,
  clearCache
};