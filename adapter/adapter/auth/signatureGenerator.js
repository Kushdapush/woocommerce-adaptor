const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../utils/config');

/**
 * Sign a request payload for ONDC
 * @param {Object|string} payload - Request payload to sign
 * @returns {Object} Signature details including headers
 */
const signRequest = (payload) => {
  try {
    // Get the private key from config
    const privateKey = config.ondc.signingPrivateKey;
    if (!privateKey) {
      throw new Error('Signing private key not configured');
    }
    
    // Convert payload to string if it's an object
    const payloadString = typeof payload === 'string' ? 
      payload : JSON.stringify(payload);
    
    // Create buffer from payload
    const payloadBuffer = Buffer.from(payloadString, 'utf8');
    
    // Generate Blake2b hash
    const hash = generateBlake2bHash(payloadBuffer);
    
    // Base64 encode the hash to get the digest
    const digest = hash.toString('base64');
    
    // Generate signature using private key
    const signature = generateEd25519Signature(hash, privateKey);
    
    // Base64 encode the signature
    const encodedSignature = signature.toString('base64');
    
    // Current timestamp in seconds
    const created = Math.floor(Date.now() / 1000);
    
    // Expires in 5 minutes (300 seconds)
    const expires = created + 300;
    
    // Construct Authorization header
    const authHeader = constructAuthHeader(encodedSignature, digest, created, expires);
    
    return {
      signature: encodedSignature,
      digest,
      authHeader
    };
  } catch (error) {
    logger.error('Error signing request', { error: error.message, stack: error.stack });
    throw error;
  }
};

/**
 * Generate Blake2b hash of the given data
 * @param {Buffer} data - Data to hash
 * @returns {Buffer} Blake2b hash
 */
const generateBlake2bHash = (data) => {
  try {
    const hash = crypto.createHash('blake2b512');
    hash.update(data);
    return hash.digest();
  } catch (error) {
    logger.error('Error generating Blake2b hash', { error: error.message });
    throw error;
  }
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

/**
 * Construct Authorization header for ONDC
 * @param {string} signature - Base64 encoded signature
 * @param {string} digest - Base64 encoded digest
 * @param {number} created - Timestamp when signature was created (seconds)
 * @param {number} expires - Timestamp when signature expires (seconds)
 * @returns {string} Authorization header value
 */
const constructAuthHeader = (signature, digest, created, expires) => {
  // Construct keyId in the format "subscriber_id|unique_key_id|algorithm"
  const keyId = `${config.ondc.subscriberId}|${config.ondc.ukId}|ed25519`;
  
  // Construct authorization header
  return `Signature keyId="${keyId}",algorithm="ed25519",created="${created}",expires="${expires}",headers="(created) (expires) digest",signature="${signature}",digest="${digest}"`;
};

module.exports = {
  signRequest,
  generateBlake2bHash,
  generateEd25519Signature
};