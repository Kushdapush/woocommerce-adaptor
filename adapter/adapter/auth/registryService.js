// adapter/adapter/auth/registryService.js
const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../utils/config');
const NodeCache = require('node-cache');
const ondcCryptoSdk = require('./ondcCryptoSdk');

// Create a cache for registry data with TTL of 1 hour
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
    
    // Prepare lookup request payload
    const lookupPayload = {
      subscriber_id: subscriberId,
      ukId: ukId,
      domain: config.ondc.domain,
      country: config.ondc.country,
      city: config.ondc.city,
      type: config.ondc.type || "BPP" // Adjust based on your use case (BPP/BAP)
    };
    
    // If we have a signing private key, create signature for lookup
    if (config.ondc.signingPrivateKey) {
      try {
        const signature = await ondcCryptoSdk.createLookupSignature({
          params: lookupPayload,
          privateKey: config.ondc.signingPrivateKey
        });
        
        // Add signature to payload
        lookupPayload.signature = signature;
      } catch (signError) {
        logger.warn('Could not sign lookup request', { 
          error: signError.message,
          subscriberId,
          ukId
        });
        // Continue without signature for now
      }
    }
    
    // Use the staging registry URL if provided in config, or fallback to default
    const registryUrl = config.ondc.registryUrl || 'https://staging.registry.ondc.org';
    
    const response = await axios.post(`${registryUrl}/lookup`, lookupPayload, {
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
    
    // For development mode, return a mock subscriber if authentication is bypassed
    if (process.env.BYPASS_AUTH === 'true' || process.env.NODE_ENV === 'development') {
      logger.warn('Returning mock subscriber data in development mode', { subscriberId, ukId });
      return {
        subscriber_id: subscriberId,
        ukId: ukId,
        signing_public_key: config.ondc.signingPublicKey || 'mock-public-key',
        encryption_public_key: config.ondc.encryptionPublicKey || 'mock-encryption-key',
        valid_from: new Date().toISOString(),
        valid_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // Valid for a year
      };
    }
    
    // In case of errors, it's safer to fail the authentication
    return null;
  }
};

/**
 * Verify lookup against the registry using vLookup endpoint
 * @param {string} subscriberId - Target subscriber ID to look up
 * @returns {Promise<Object|null>} Subscriber details or null if not found
 */
const verifyLookup = async (subscriberId) => {
  try {
    const timestamp = new Date().toISOString();
    
    // Prepare the vLookup request
    const vLookupRequest = {
      sender_subscriber_id: config.ondc.subscriberId || config.ondc.subscriptionId,
      request_id: `req-${Date.now()}`,
      timestamp: timestamp,
      search_parameters: {
        domain: config.ondc.domain,
        subscriber_id: subscriberId,
        country: config.ondc.country,
        type: config.ondc.type || "BPP",
        city: config.ondc.city
      }
    };
    
    // Sign the request with ONDC crypto SDK if private key is available
    if (config.ondc.signingPrivateKey) {
      try {
        const signature = await ondcCryptoSdk.createLookupSignature({
          params: vLookupRequest,
          privateKey: config.ondc.signingPrivateKey
        });
        
        vLookupRequest.signature = signature;
      } catch (signError) {
        logger.warn('Could not sign vLookup request', { 
          error: signError.message,
          subscriberId
        });
        // Continue without signature for now
      }
    }
    
    // Use the staging registry URL if provided in config, or fallback to default
    const registryUrl = config.ondc.registryUrl || 'https://staging.registry.ondc.org';
    
    const response = await axios.post(`${registryUrl}/vlookup`, vLookupRequest, {
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
    
    // For development mode, return a mock subscriber if authentication is bypassed
    if (process.env.BYPASS_AUTH === 'true' || process.env.NODE_ENV === 'development') {
      logger.warn('Returning mock subscriber data in development mode', { subscriberId });
      return {
        subscriber_id: subscriberId,
        signing_public_key: config.ondc.signingPublicKey || 'mock-public-key',
        encryption_public_key: config.ondc.encryptionPublicKey || 'mock-encryption-key'
      };
    }
    
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