const keyGenerator = require('../auth/keyGenerator');
const path = require('path');

// Get output directory from command line args or use default
const outputDir = process.argv[2] || path.join(__dirname, '..', 'keys');

console.log('Generating ONDC cryptographic keys...');
console.log(`Output directory: ${outputDir}`);

// Generate the keys
const { signingKeys, encryptionKeys } = keyGenerator.generateAndSaveKeys(outputDir);

console.log('\nKey generation complete!');
console.log('\nImportant: Register these public keys with the ONDC Registry');
console.log('-----------------------------------------------------------');
console.log(`Signing Public Key:\n${signingKeys.publicKey}`);
console.log(`\nEncryption Public Key:\n${encryptionKeys.publicKey}`);
console.log('\nAdd the following to your .env file:');
console.log('-----------------------------------------------------------');
console.log(`ONDC_SIGNING_PRIVATE_KEY=${signingKeys.privateKey}`);
console.log(`ONDC_SIGNING_PUBLIC_KEY=${signingKeys.publicKey}`);
console.log(`ONDC_ENCRYPTION_PRIVATE_KEY=${encryptionKeys.privateKey}`);
console.log(`ONDC_ENCRYPTION_PUBLIC_KEY=${encryptionKeys.publicKey}`);