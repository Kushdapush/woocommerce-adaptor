const signatureVerifier = require('./signatureVerifier');
const registryService = require('./registryService');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');

/**
 * Middleware to verify ONDC authentication
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const verifyAuthentication = async (req, res, next) => {
  try {
    // Skip auth for health check and internal endpoints
    if (req.path === '/health' || req.path.startsWith('/internal/')) {
      return next();
    }

    const authHeader = req.headers.authorization;
    
    // Check if Authorization header exists
    if (!authHeader) {
      logger.warn('Missing authorization header', { path: req.path });
      throw new ApiError('Missing authorization header', 401);
    }

    // Parse the authorization header
    // Expected format: Signature keyId="subscriber_id|unique_key_id|algorithm",algorithm="algorithm",created="timestamp",expires="timestamp",headers="headers",signature="signature"
    const authComponents = parseAuthHeader(authHeader);
    
    if (!authComponents) {
      logger.warn('Invalid authorization header format', { path: req.path });
      throw new ApiError('Invalid authorization header format', 401);
    }

    const { subscriberId, ukId, algorithm, signature, digest } = authComponents;
    
    // Fetch subscriber details from registry
    const subscriber = await registryService.lookupSubscriber(subscriberId, ukId);
    
    if (!subscriber) {
      logger.warn('Could not find subscriber in registry', { subscriberId, ukId, path: req.path });
      throw new ApiError('Subscriber not found', 401);
    }
    
    // Verify signature using the public key from the registry
    const isValid = await signatureVerifier.verifySignature(
      req.rawBody, // Raw body is set in the bodyParser middleware
      signature,
      digest,
      subscriber.signing_public_key
    );
    
    if (!isValid) {
      logger.warn('Signature verification failed', { subscriberId, ukId, path: req.path });
      throw new ApiError('Signature verification failed', 401);
    }
    
    // Store subscriber info in request for later use
    req.subscriber = subscriber;
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.status).json({
        message: {
          ack: {
            status: "NACK"
          }
        },
        error: {
          code: String(error.status),
          message: error.message
        }
      });
    }
    
    logger.error('Authentication error', { error: error.message, stack: error.stack });
    
    res.status(401).json({
      message: {
        ack: {
          status: "NACK"
        }
      },
      error: {
        code: "401",
        message: "Authentication failed"
      }
    });
  }
};

/**
 * Parse the authorization header
 * @param {string} authHeader - Authorization header string
 * @returns {Object|null} Parsed components or null if invalid
 */
const parseAuthHeader = (authHeader) => {
  try {
    // Extract the signature part
    if (!authHeader.startsWith('Signature ')) {
      return null;
    }
    
    const signaturePart = authHeader.substring(10);
    
    // Parse the key=value pairs
    const components = {};
    const regex = /([a-zA-Z0-9_]+)=(?:"([^"]*)")/g;
    let match;
    
    while ((match = regex.exec(signaturePart)) !== null) {
      components[match[1]] = match[2];
    }
    
    // Check for required components
    if (!components.keyId || !components.signature || !components.algorithm) {
      return null;
    }
    
    // Parse the keyId which should be in the format "subscriber_id|unique_key_id|algorithm"
    const keyIdParts = components.keyId.split('|');
    if (keyIdParts.length !== 3) {
      return null;
    }
    
    const [subscriberId, ukId, keyAlgorithm] = keyIdParts;
    
    // Extract digest from signature (if present)
    let digest = null;
    if (components.digest) {
      digest = components.digest;
    } else {
      // Some implementations include digest in the signature itself
      // This would need to be extracted based on your specific implementation
    }
    
    return {
      subscriberId,
      ukId,
      algorithm: components.algorithm,
      signature: components.signature,
      digest,
      created: components.created,
      expires: components.expires
    };
  } catch (error) {
    logger.error('Error parsing auth header', { error: error.message });
    return null;
  }
};

module.exports = {
  verifyAuthentication
};