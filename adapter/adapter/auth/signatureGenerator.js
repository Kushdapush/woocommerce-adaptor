// adapter/adapter/auth/signatureGenerator.js
const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../utils/config');
const ondcCryptoSdk = require('./ondcCryptoSdk');

/**
 * Sign a request payload for ONDC
 * @param {Object|string} payload - Request payload to sign
 * @returns {Promise<Object>} Signature details including headers
 */
const signRequest = async (payload) => {
  try {
    // Get the private key from config
    const privateKey = config.ondc.signingPrivateKey;
    if (!privateKey) {
      throw new Error('Signing private key not configured');
    }
    
    // Get the subscriber ID from config
    const subscriberId = config.ondc.subscriberId || config.ondc.subscriptionId;
    if (!subscriberId) {
      throw new Error('Subscriber ID not configured');
    }
    
    // Get the unique key ID from config
    const ukId = config.ondc.ukId;
    if (!ukId) {
      throw new Error('Unique key ID not configured');
    }
    
    // Create authorization header using ONDC SDK
    const authHeader = await ondcCryptoSdk.createAuthorizationHeader({
      body: payload,
      privateKey: privateKey,
      subscriberId: subscriberId,
      ukId: ukId
    });
    
    return {
      authHeader
    };
  } catch (error) {
    logger.error('Error signing request', { error: error.message, stack: error.stack });
    throw error;
  }
};

/**
 * Generate Blake2b hash of the given data
 * @param {Buffer|string} data - Data to hash
 * @returns {Buffer} Blake2b hash
 */
const generateBlake2bHash = (data) => {
  return ondcCryptoSdk.generateBlake2bHash(data);
};

/**
 * Generate ED25519 signature
 * @param {Buffer} message - Message hash to sign
 * @param {string} privateKeyBase64 - Base64 encoded ED25519 private key
 * @returns {Buffer} Signature
 */
const generateEd25519Signature = (message, privateKeyBase64) => {
  try {
    // Decode the base64 private key
    const privateKey = Buffer.from(privateKeyBase64, 'base64');
    
    // Sign the message
    return crypto.sign(
      null, // No algorithm needed for ed25519
      message,
      {
        key: privateKey,
        format: 'raw'
      }
    );
  } catch (error) {
    logger.error('Error generating ED25519 signature', { error: error.message });
    throw error;
  }
};

module.exports = {
  signRequest,
  generateBlake2bHash,
  generateEd25519Signature
};