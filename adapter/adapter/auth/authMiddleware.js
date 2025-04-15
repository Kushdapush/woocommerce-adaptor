// adapter/adapter/auth/authMiddleware.js
const registryService = require('./registryService');
const ondcCryptoSdk = require('./ondcCryptoSdk');
const logger = require('../utils/logger');
const config = require('../utils/config');
const { ApiError } = require('../utils/errorHandler');

/**
 * Middleware to verify ONDC authentication
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const verifyAuthentication = async (req, res, next) => {
  try {
    // For local testing or development, allow requests without auth if configured
    if (process.env.NODE_ENV === 'development' || process.env.BYPASS_AUTH === 'true' || !config.server.enableAuthentication) {
      logger.debug('Authentication bypassed due to environment settings', { 
        path: req.path,
        bypassAuth: process.env.BYPASS_AUTH,
        nodeEnv: process.env.NODE_ENV,
        enableAuth: config.server.enableAuthentication
      });
      return next();
    }

    // Skip auth for health check and internal endpoints
    if (req.path === '/health' || req.path.startsWith('/internal/')) {
      return next();
    }

    // Check Authorization header
    const authHeader = req.headers.authorization;
    // Check X-Gateway-Authorization header (if request comes from gateway)
    const gatewayAuthHeader = req.headers['x-gateway-authorization'];
    
    // At least one header should be present
    if (!authHeader && !gatewayAuthHeader) {
      logger.warn('Missing authorization headers', { path: req.path });
      throw new ApiError('Missing authorization headers', 401);
    }

    // Get the raw body from the request
    const body = req.rawBody || JSON.stringify(req.body);
    
    // Process Authorization header (if present)
    if (authHeader) {
      const authComponents = parseAuthHeader(authHeader);
      
      if (!authComponents) {
        logger.warn('Invalid authorization header format', { path: req.path });
        throw new ApiError('Invalid authorization header format', 401);
      }

      const { subscriberId, ukId, algorithm } = authComponents;
      
      // Lookup subscriber in registry to get their public key
      const subscriber = await registryService.lookupSubscriber(subscriberId, ukId);
      
      if (!subscriber || !subscriber.signing_public_key) {
        logger.warn('Subscriber not found in registry or missing public key', { 
          subscriberId, 
          ukId,
          path: req.path
        });
        throw new ApiError('Subscriber not found or missing public key', 401);
      }
      
      // Verify the Authorization header
      const isValid = await ondcCryptoSdk.isHeaderValid({
        body,
        header: authHeader,
        publicKey: subscriber.signing_public_key
      });
      
      if (!isValid) {
        logger.warn('Invalid Authorization signature', { 
          subscriberId, 
          ukId,
          path: req.path
        });
        throw new ApiError('Invalid Authorization signature', 401);
      }
      
      // Store subscriber info in request for later use
      req.ondcSubscriber = {
        id: subscriberId,
        ukId,
        publicKey: subscriber.signing_public_key
      };
    }
    
    // Process X-Gateway-Authorization header (if present)
    if (gatewayAuthHeader) {
      const gatewayAuthComponents = parseAuthHeader(gatewayAuthHeader);
      
      if (!gatewayAuthComponents) {
        logger.warn('Invalid gateway authorization header format', { path: req.path });
        throw new ApiError('Invalid gateway authorization header format', 401);
      }

      const { subscriberId, ukId, algorithm } = gatewayAuthComponents;
      
      // Lookup gateway in registry to get its public key
      const gateway = await registryService.lookupSubscriber(subscriberId, ukId);
      
      if (!gateway || !gateway.signing_public_key) {
        logger.warn('Gateway not found in registry or missing public key', { 
          subscriberId, 
          ukId,
          path: req.path
        });
        throw new ApiError('Gateway not found or missing public key', 401);
      }
      
      // Verify the X-Gateway-Authorization header
      const isValid = await ondcCryptoSdk.isHeaderValid({
        body,
        header: gatewayAuthHeader,
        publicKey: gateway.signing_public_key
      });
      
      if (!isValid) {
        logger.warn('Invalid X-Gateway-Authorization signature', { 
          subscriberId, 
          ukId,
          path: req.path
        });
        throw new ApiError('Invalid X-Gateway-Authorization signature', 401);
      }
      
      // Store gateway info in request for later use
      req.ondcGateway = {
        id: subscriberId,
        ukId,
        publicKey: gateway.signing_public_key
      };
    }
    
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
    
    // Extract digest if present
    let digest = null;
    if (components.digest) {
      const digestParts = components.digest.split('=');
      if (digestParts.length >= 2) {
        digest = digestParts[1];
      }
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