const fs = require('fs');
const path = require('path');

const envContent = `# ONDC Authentication Configuration
ONDC_SUBSCRIBER_ID=woocommerce-test-adaptor.ondc.org     # Your ONDC subscriber ID
ONDC_UK_ID=dc100861-8391-4aae-a5ea-41b83f8e0fb6        # Your unique key ID registered with ONDC
ONDC_DOMAIN=ONDC:RET10                                  # ONDC Domain
ONDC_COUNTRY=IND                                        # Country code
ONDC_CITY=std:080                                       # City code (Bangalore)
ONDC_TYPE=BPP                                          # BPP (Buyer Platform Provider)

# ONDC Registry URLs
ONDC_REGISTRY_URL=https://staging.registry.ondc.org
ONDC_GATEWAY_URL=https://staging.gateway.ondc.org

# ONDC Cryptographic Keys (Base64 encoded)
ONDC_SIGNING_PUBLIC_KEY=MCowBQYDK2VwAyEAk9uZivI1oQ3dlCshoLEBYE7cpyVw+ga3YmK2JEub84Y=
ONDC_SIGNING_PRIVATE_KEY=MC4CAQAwBQYDK2VwBCIEIKr5LUQq6sX2Z7HpMdRTtNi09Y1sCwvr3A3GqcjLGGsS
ONDC_ENCRYPTION_PUBLIC_KEY=MCowBQYDK2VuAyEA41O9ruqeFYJ9KFIvPRHFO/GdUnxdsgRroWl6E4qXohE=
ONDC_ENCRYPTION_PRIVATE_KEY=MC4CAQAwBQYDK2VuBCIEIPjDra313uRfMH156iAMNRsFa9tsR3KQSFKTEvB301tN

# Environment
NODE_ENV=development
`;

const envPath = path.join(__dirname, '..', '.env');

try {
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Environment file created successfully at:', envPath);
    console.log('🔐 ONDC credentials configured');
} catch (error) {
    console.error('❌ Error creating environment file:', error);
    process.exit(1);
}