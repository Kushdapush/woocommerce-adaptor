// adapter/adapter/auth/ondcCryptoSdk.js
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * ONDC Crypto SDK for Node.js
 * Implements cryptographic operations required for ONDC authentication
 */
class OndcCryptoSdk {
  /**
   * Create Authorization header for ONDC requests
   * @param {Object} options - Configuration options
   * @param {Object|string} options.body - Request body
   * @param {string} options.privateKey - ED25519 private key in base64 format
   * @param {string} options.subscriberId - ONDC subscriber ID
   * @param {string} options.ukId - Unique key ID registered with ONDC
   * @returns {string} Authorization header value
   */
  async createAuthorizationHeader(options) {
    try {
      const { body, privateKey, subscriberId, ukId } = options;
      
      // Convert body to string if it's an object
      const bodyStr = typeof body === 'object' ? JSON.stringify(body) : body;
      
      // Generate digest using BLAKE-512
      const digestBuffer = crypto.createHash('blake2b512').update(bodyStr).digest();
      const digest = digestBuffer.toString('base64');
      
      // Create timestamp values
      const created = Math.floor(Date.now() / 1000);
      const expires = created + 3600; // 1 hour expiry
      
      // Create signing string
      const signingString = `(created): ${created}\n(expires): ${expires}\ndigest: BLAKE-512=${digest}`;
      
      // Decode private key from base64
      const privateKeyBuffer = Buffer.from(privateKey, 'base64');
      
      // Sign the signing string using Ed25519
      const signature = crypto.sign(null, Buffer.from(signingString), privateKeyBuffer);
      const signatureBase64 = signature.toString('base64');
      
      // Construct the Authorization header
      return `Signature keyId="${subscriberId}|${ukId}|ed25519",algorithm="ed25519",created="${created}",expires="${expires}",headers="(created) (expires) digest",signature="${signatureBase64}",digest="BLAKE-512=${digest}"`;
    } catch (error) {
      logger.error('Error creating authorization header', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Verify Authorization header for ONDC requests
   * @param {Object} options - Configuration options
   * @param {Object|string} options.body - Request body
   * @param {string} options.header - Authorization header value
   * @param {string} options.publicKey - ED25519 public key in base64 format
   * @returns {boolean} True if signature is valid, false otherwise
   */
  async isHeaderValid(options) {
    try {
      const { body, header, publicKey } = options;
      
      // Extract components from the header
      if (!header.startsWith('Signature ')) {
        return false;
      }
      
      const headerComponents = {};
      const headerParams = header.substring(10).split(',');
      
      for (const param of headerParams) {
        const [key, value] = param.split('=');
        headerComponents[key.trim()] = value.replace(/"/g, '').trim();
      }
      
      const { keyId, algorithm, created, expires, signature } = headerComponents;
      
      // Verify algorithm
      if (algorithm !== 'ed25519') {
        return false;
      }
      
      // Extract digest from header
      let digest;
      if (headerComponents.digest) {
        digest = headerComponents.digest.split('=')[1];
      }
      
      // Convert body to string if it's an object
      const bodyStr = typeof body === 'object' ? JSON.stringify(body) : body;
      
      // Calculate digest from body
      const calculatedDigestBuffer = crypto.createHash('blake2b512').update(bodyStr).digest();
      const calculatedDigest = calculatedDigestBuffer.toString('base64');
      
      // If digest is provided, verify it matches calculated digest
      if (digest && digest !== calculatedDigest) {
        return false;
      }
      
      // Recreate the signing string
      const signingString = `(created): ${created}\n(expires): ${expires}\ndigest: BLAKE-512=${calculatedDigest}`;
      
      // Decode public key and signature
      const publicKeyBuffer = Buffer.from(publicKey, 'base64');
      const signatureBuffer = Buffer.from(signature, 'base64');
      
      // Verify the signature
      return crypto.verify(
        null,
        Buffer.from(signingString),
        publicKeyBuffer,
        signatureBuffer
      );
    } catch (error) {
      logger.error('Error verifying header', { error: error.message, stack: error.stack });
      return false;
    }
  }

  /**
   * Create signature for lookup request
   * @param {Object} options - Configuration options
   * @param {Object} options.params - Lookup request parameters
   * @param {string} options.privateKey - ED25519 private key in base64 format
   * @returns {string} Signature for lookup request
   */
  async createLookupSignature(options) {
    try {
      const { params, privateKey } = options;
      
      // Convert params to string
      const paramsStr = typeof params === 'object' ? JSON.stringify(params) : params;
      
      // Decode private key from base64
      const privateKeyBuffer = Buffer.from(privateKey, 'base64');
      
      // Sign the params string using Ed25519
      const signature = crypto.sign(null, Buffer.from(paramsStr), privateKeyBuffer);
      return signature.toString('base64');
    } catch (error) {
      logger.error('Error creating lookup signature', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Generate Blake-512 hash of the given data
   * @param {Buffer|string} data - Data to hash
   * @returns {Buffer} Blake-512 hash buffer
   */
  generateBlake2bHash(data) {
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
  }
}

// Export a singleton instance
module.exports = new OndcCryptoSdk();