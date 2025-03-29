const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Verify the signature of a request
 * @param {Buffer|string} body - Raw request body
 * @param {string} signature - Signature from the authorization header
 * @param {string} providedDigest - Digest from the authorization header (if present)
 * @param {string} publicKey - Base64 encoded public key from registry
 * @returns {Promise<boolean>} Verification result
 */
const verifySignature = async (body, signature, providedDigest, publicKey) => {
  try {
    // Generate Blake2b hash of the payload
    const hash = generateBlake2bHash(body);
    
    // Convert hash to base64 to get the digest
    const calculatedDigest = hash.toString('base64');
    
    // If a digest was provided in the header, compare it with our calculated digest
    if (providedDigest && providedDigest !== calculatedDigest) {
      logger.warn('Digest mismatch', { 
        providedDigest, 
        calculatedDigest: calculatedDigest.substring(0, 20) + '...'
      });
      return false;
    }
    
    // Decode the base64 public key
    const publicKeyBuffer = Buffer.from(publicKey, 'base64');
    
    // Decode the base64 signature
    const signatureBuffer = Buffer.from(signature, 'base64');
    
    // Verify the signature
    // Note: The exact verification depends on the algorithm (ed25519 in ONDC's case)
    const verified = verifyEd25519Signature(hash, signatureBuffer, publicKeyBuffer);
    
    return verified;
  } catch (error) {
    logger.error('Error verifying signature', { error: error.message, stack: error.stack });
    return false;
  }
};

/**
 * Generate Blake2b hash of the given data
 * @param {Buffer|string} data - Data to hash
 * @returns {Buffer} Blake2b hash
 */
const generateBlake2bHash = (data) => {
  try {
    // Ensure data is a buffer
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    
    // Generate Blake2b hash
    const hash = crypto.createHash('blake2b512');
    hash.update(dataBuffer);
    return hash.digest();
  } catch (error) {
    logger.error('Error generating Blake2b hash', { error: error.message });
    throw error;
  }
};

/**
 * Verify ED25519 signature
 * @param {Buffer} message - Message hash to verify
 * @param {Buffer} signature - Signature to verify
 * @param {Buffer} publicKey - ED25519 public key
 * @returns {boolean} Verification result
 */
const verifyEd25519Signature = (message, signature, publicKey) => {
  try {
    return crypto.verify(
      null, // No algorithm needed for ed25519
      message,
      {
        key: publicKey,
        format: 'raw'
      },
      signature
    );
  } catch (error) {
    logger.error('Error verifying ED25519 signature', { error: error.message });
    return false;
  }
};

module.exports = {
  verifySignature,
  generateBlake2bHash
};