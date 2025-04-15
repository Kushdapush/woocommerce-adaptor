const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Generate ED25519 key pair for ONDC signing
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
 * Generate X25519 key pair for ONDC encryption
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
  
  console.log('Generating ONDC cryptographic keys...');
  
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
  console.log('\nPublic keys to register with ONDC:');
  console.log(`Signing Public Key: ${signingKeys.publicKey}`);
  console.log(`Encryption Public Key: ${encryptionKeys.publicKey}`);
  
  // Create .env entries
  const envEntries = `
# ONDC Cryptographic Keys
ONDC_SIGNING_PUBLIC_KEY=${signingKeys.publicKey}
ONDC_SIGNING_PRIVATE_KEY=${signingKeys.privateKey}
ONDC_ENCRYPTION_PUBLIC_KEY=${encryptionKeys.publicKey}
ONDC_ENCRYPTION_PRIVATE_KEY=${encryptionKeys.privateKey}
`;

  // Save to .env.keys file for easy copying
  fs.writeFileSync(
    path.join(outputDir, '.env.keys'),
    envEntries.trim()
  );
  
  console.log('\nKey entries for .env file have been saved to keys/.env.keys');
  console.log('You can copy these entries to your main .env file');
  
  return {
    signingKeys,
    encryptionKeys
  };
};

/**
 * Interactive utility for updating an existing .env file with generated keys
 * @param {string} envFile - Path to .env file
 * @param {Object} keys - Keys object containing signingKeys and encryptionKeys
 */
const updateEnvFile = (envFile, keys) => {
  if (!fs.existsSync(envFile)) {
    console.error(`Error: ${envFile} not found`);
    return false;
  }
  
  // Read the existing .env file
  const envContent = fs.readFileSync(envFile, 'utf8');
  
  // Create new content with updated keys
  let updatedContent = envContent;
  
  // Check for existing keys and replace them
  const keyPatterns = {
    ONDC_SIGNING_PUBLIC_KEY: keys.signingKeys.publicKey,
    ONDC_SIGNING_PRIVATE_KEY: keys.signingKeys.privateKey,
    ONDC_ENCRYPTION_PUBLIC_KEY: keys.encryptionKeys.publicKey,
    ONDC_ENCRYPTION_PRIVATE_KEY: keys.encryptionKeys.privateKey
  };
  
  for (const [key, value] of Object.entries(keyPatterns)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(updatedContent)) {
      // Replace existing key
      updatedContent = updatedContent.replace(regex, `${key}=${value}`);
    } else {
      // Add new key at the end
      updatedContent += `\n${key}=${value}`;
    }
  }
  
  // Write the updated content back to the .env file
  fs.writeFileSync(envFile, updatedContent);
  
  console.log(`Updated keys in ${envFile}`);
  return true;
}

/**
 * Create sample request for testing
 * @param {Object} keys - Keys object containing signingKeys and encryptionKeys
 * @param {string} subscriberId - Subscriber ID
 * @param {string} ukId - Unique key ID
 */
const createSampleRequest = async (subscriberId, uniqueKeyId, signingKey) => {
  try {
    const payload = {
      context: {
        domain: "nic2004:52110",
        country: "IND",
        city: "std:080",
        action: "search",
        core_version: "1.1.0",
        bap_id: "buyer-app.ondc.org",
        bap_uri: "https://buyer-app.ondc.org/protocol/v1",
        bpp_id: subscriberId,
        bpp_uri: "https://api.woocommerce-test-adaptor.ondc.org/protocol/v1",
        transaction_id: crypto.randomUUID(),
        message_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        ttl: "PT30S"
      },
      message: {
        intent: {
          item: {
            descriptor: {
              name: "Test Product"
            }
          }
        }
      }
    };

    // Convert payload to canonical form
    const canonicalData = JSON.stringify(payload);

    // Create signing string
    const digest = crypto.createHash('blake2s256')
      .update(canonicalData)
      .digest('base64');

    const signingString = `(created): ${Math.floor(Date.now() / 1000)}
(expires): ${Math.floor(Date.now() / 1000) + 3600}
digest: BLAKE-512=${digest}`;

    // Sign the string
    const signature = crypto.sign(
      null,
      Buffer.from(signingString),
      signingKey
    );

    return {
      payload,
      signature: signature.toString('base64'),
      signingString
    };
  } catch (error) {
    console.error('Error creating sample request:', error);
    throw error;
  }
};

// Run the script if executed directly
const main = async () => {
  try {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('==========================================================');
    console.log('ONDC Key Generator and Test Helper');
    console.log('==========================================================');

    const subscriberId = await new Promise(resolve => {
      rl.question('Enter your ONDC Subscriber ID (e.g., example-bpp.com): ', resolve);
    });

    const uniqueKeyId = await new Promise(resolve => {
      rl.question('Enter your ONDC Unique Key ID (e.g., bpp1234): ', resolve);
    });

    // Generate ED25519 signing keypair
    const signingKeyPair = crypto.generateKeyPairSync('ed25519');
    const encryptionKeyPair = crypto.generateKeyPairSync('x25519');

    // Create keys directory if it doesn't exist
    const keysDir = path.join(__dirname, '..', 'keys');
    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir);
    }

    // Save keys
    fs.writeFileSync(
      path.join(keysDir, 'signing_private.key'),
      signingKeyPair.privateKey.export({ type: 'pkcs8', format: 'pem' })
    );

    fs.writeFileSync(
      path.join(keysDir, 'encryption_private.key'),
      encryptionKeyPair.privateKey.export({ type: 'pkcs8', format: 'pem' })
    );

    console.log('Keys generated and saved successfully!');
    rl.close();

  } catch (error) {
    console.error('Error generating keys:', error);
    process.exit(1);
  }
};

main().catch(console.error);

module.exports = {
  generateSigningKeyPair,
  generateEncryptionKeyPair,
  generateAndSaveKeys
};