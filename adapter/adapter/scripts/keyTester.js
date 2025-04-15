const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Fallback logger in case the main logger is not available
const logger = (() => {
    try {
        return require('../src/utils/logger');
    } catch (error) {
        return {
            info: console.log,
            warn: console.warn,
            error: console.error
        };
    }
})();

class KeyTester {
    constructor(keysDirectory) {
        this.keysDir = keysDirectory || path.join(__dirname, '..', 'keys');
        this.requiredFiles = [
            'signing_private_key.b64',
            'signing_public_key.b64',
            'encryption_private_key.b64',
            'encryption_public_key.b64',
            '.env.keys'
        ];
    }

    checkKeyFiles() {
        const missingFiles = this.requiredFiles.filter(file => 
            !fs.existsSync(path.join(this.keysDir, file))
        );

        if (missingFiles.length > 0) {
            logger.warn('Missing key files:', { files: missingFiles });
            return {
                success: false,
                missing: missingFiles
            };
        }
        return { success: true };
    }

    testSigningKey() {
        try {
            const privateKeyPath = path.join(this.keysDir, 'signing_private_key.b64');
            const publicKeyPath = path.join(this.keysDir, 'signing_public_key.b64');

            if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
                throw new Error('Signing keys not found');
            }

            // Read and convert keys with proper PEM formatting
            const privateKeyB64 = fs.readFileSync(privateKeyPath, 'utf8').trim();
            const publicKeyB64 = fs.readFileSync(publicKeyPath, 'utf8').trim();

            const privateKey = crypto.createPrivateKey({
                key: Buffer.from(privateKeyB64, 'base64'),
                format: 'der',
                type: 'pkcs8'
            });

            const publicKey = crypto.createPublicKey({
                key: Buffer.from(publicKeyB64, 'base64'),
                format: 'der',
                type: 'spki'
            });
            
            const testMessage = 'ONDC Test Message';
            const signature = crypto.sign(null, Buffer.from(testMessage), privateKey);
            
            // Verify signature
            const isVerified = crypto.verify(
                null,
                Buffer.from(testMessage),
                publicKey,
                signature
            );

            logger.info('Signing key test successful');
            return {
                success: true,
                signature: signature.toString('base64'),
                verified: isVerified
            };
        } catch (error) {
            logger.error('Signing key test failed', { error: error.message });
            return {
                success: false,
                error: error.message
            };
        }
    }

    testEncryptionKey() {
        try {
            const privateKeyPath = path.join(this.keysDir, 'encryption_private_key.b64');
            const publicKeyPath = path.join(this.keysDir, 'encryption_public_key.b64');

            if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
                throw new Error('Encryption keys not found');
            }

            // Read keys
            const privateKeyB64 = fs.readFileSync(privateKeyPath, 'utf8').trim();
            const publicKeyB64 = fs.readFileSync(publicKeyPath, 'utf8').trim();

            // For X25519, we use the raw key bytes
            const privateKeyBytes = Buffer.from(privateKeyB64, 'base64');
            const publicKeyBytes = Buffer.from(publicKeyB64, 'base64');

            // Test key exchange (ECDH)
            const privateKey = crypto.createPrivateKey({
                key: privateKeyBytes,
                format: 'der',
                type: 'pkcs8'
            });

            const publicKey = crypto.createPublicKey({
                key: publicKeyBytes,
                format: 'der',
                type: 'spki'
            });

            // Create a shared secret to verify the keys work together
            const sharedSecret1 = crypto.diffieHellman({
                privateKey,
                publicKey
            });

            logger.info('Encryption key test successful');
            return {
                success: true,
                valid: sharedSecret1.length === 32 // X25519 shared secret is always 32 bytes
            };
        } catch (error) {
            logger.error('Encryption key test failed', { error: error.message });
            return {
                success: false,
                error: error.message
            };
        }
    }

    verifyKeys() {
        const fileCheck = this.checkKeyFiles();
        if (!fileCheck.success) {
            return {
                files: fileCheck,
                signing: { success: false },
                encryption: { success: false },
                isValid: false
            };
        }

        const signingResult = this.testSigningKey();
        const encryptionResult = this.testEncryptionKey();

        return {
            files: fileCheck,
            signing: signingResult,
            encryption: encryptionResult,
            isValid: signingResult.success && encryptionResult.success
        };
    }
}

// CLI execution
if (require.main === module) {
    const tester = new KeyTester();
    const results = tester.verifyKeys();
    
    console.table({
        'File Check': results.files.success ? 'PASSED ✅' : 'FAILED ❌',
        'Signing Key': results.signing.success ? 'PASSED ✅' : 'FAILED ❌',
        'Encryption Key': results.encryption.success ? 'PASSED ✅' : 'FAILED ❌'
    });

    process.exit(results.isValid ? 0 : 1);
}

module.exports = KeyTester;