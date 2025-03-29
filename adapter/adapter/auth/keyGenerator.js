const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Generate ED25519 key pair for signing
 * @returns {Object} Object containing public and private keys in base64 format
 */
const generateSigningKeyPair = () => {
  // Generate ED25519 key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
  
  // Extract raw keys (remove PEM headers/footers and decode base64)
  const publicKeyRaw = extractRawKeyFromPem(publicKey);
  const privateKeyRaw = extractRawKeyFromPem(privateKey);
  
  // Convert to base64 for storage
  return {
    publicKey: publicKeyRaw.toString('base64'),
    privateKey: privateKeyRaw.toString('base64')
  };
};

/**
 * Generate X25519 key pair for encryption
 * @returns {Object} Object containing public and private keys in base64 format
 */
const generateEncryptionKeyPair = () => {
  // Generate X25519 key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519', {
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
  
  // Extract raw keys (remove PEM headers/footers and decode base64)
  const publicKeyRaw = extractRawKeyFromPem(publicKey);
  const privateKeyRaw = extractRawKeyFromPem(privateKey);
  
  // Convert to base64 for storage
  return {
    publicKey: publicKeyRaw.toString('base64'),
    privateKey: privateKeyRaw.toString('base64')
  };
};

/**
 * Extract raw key bytes from PEM format
 * @param {string} pemKey - Key in PEM format
 * @returns {Buffer} Raw key bytes
 */
const extractRawKeyFromPem = (pemKey) => {
  // Remove headers, footers, and newlines
  const base64Key = pemKey
    .replace(/-----BEGIN.*?-----/, '')
    .replace(/-----END.*?-----/, '')
    .replace(/\n/g, '');
  
  // Decode base64 to get the raw key bytes
  return Buffer.from(base64Key, 'base64');
};

/**
 * Generate and save key pairs to files
 * @param {string} outputDir - Directory to save keys
 */
const generateAndSaveKeys = (outputDir = './keys') => {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Generate signing keys
  const signingKeys = generateSigningKeyPair();
  fs.writeFileSync(
    path.join(outputDir, 'signing_private_key.b64'),
    signingKeys.privateKey
  );
  fs.writeFileSync(
    path.join(outputDir, 'signing_public_key.b64'),
    signingKeys.publicKey
  );
  
  // Generate encryption keys
  const encryptionKeys = generateEncryptionKeyPair();
  fs.writeFileSync(
    path.join(outputDir, 'encryption_private_key.b64'),
    encryptionKeys.privateKey
  );
  fs.writeFileSync(
    path.join(outputDir, 'encryption_public_key.b64'),
    encryptionKeys.publicKey
  );
  
  console.log(`Keys generated and saved to ${outputDir}`);
  console.log('Public keys to register with ONDC:');
  console.log(`Signing Public Key: ${signingKeys.publicKey}`);
  console.log(`Encryption Public Key: ${encryptionKeys.publicKey}`);
  
  return {
    signingKeys,
    encryptionKeys
  };
};

/**
 * Load keys from environment variables or files
 * @returns {Object} Object containing all keys
 */
const loadKeys = () => {
  const keys = {
    signingPublicKey: process.env.ONDC_SIGNING_PUBLIC_KEY,
    signingPrivateKey: process.env.ONDC_SIGNING_PRIVATE_KEY,
    encryptionPublicKey: process.env.ONDC_ENCRYPTION_PUBLIC_KEY,
    encryptionPrivateKey: process.env.ONDC_ENCRYPTION_PRIVATE_KEY
  };
  
  // If keys are not in environment variables, try to load from files
  if (!keys.signingPrivateKey) {
    try {
      const keysDir = process.env.KEYS_DIR || './keys';
      
      if (fs.existsSync(path.join(keysDir, 'signing_private_key.b64'))) {
        keys.signingPrivateKey = fs.readFileSync(
          path.join(keysDir, 'signing_private_key.b64'),
          'utf8'
        ).trim();
      }
      
      if (fs.existsSync(path.join(keysDir, 'signing_public_key.b64'))) {
        keys.signingPublicKey = fs.readFileSync(
          path.join(keysDir, 'signing_public_key.b64'),
          'utf8'
        ).trim();
      }
      
      if (fs.existsSync(path.join(keysDir, 'encryption_private_key.b64'))) {
        keys.encryptionPrivateKey = fs.readFileSync(
          path.join(keysDir, 'encryption_private_key.b64'),
          'utf8'
        ).trim();
      }
      
      if (fs.existsSync(path.join(keysDir, 'encryption_public_key.b64'))) {
        keys.encryptionPublicKey = fs.readFileSync(
          path.join(keysDir, 'encryption_public_key.b64'),
          'utf8'
        ).trim();
      }
    } catch (error) {
      console.error('Error loading keys from files:', error.message);
    }
  }
  
  return keys;
};

// If this script is run directly, generate keys
if (require.main === module) {
  generateAndSaveKeys();
}

module.exports = {
  generateSigningKeyPair,
  generateEncryptionKeyPair,
  generateAndSaveKeys,
  loadKeys
};