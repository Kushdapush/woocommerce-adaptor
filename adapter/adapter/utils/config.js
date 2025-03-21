require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 3000
  },
  woocommerce: {
    url: process.env.WOO_BASE_URL,
    consumerKey: process.env.WOO_CONSUMER_KEY,
    consumerSecret: process.env.WOO_CONSUMER_SECRET,
    version: process.env.WOO_API_VERSION || 'wc/v3',
    timeout: parseInt(process.env.WOO_API_TIMEOUT || '30000')
  },
  ondc: {
    authToken: process.env.ONDC_AUTH_TOKEN,
    subscriptionId: process.env.ONDC_SUBSCRIPTION_ID,
    participantId: process.env.ONDC_PARTICIPANT_ID,
    bppId: process.env.ONDC_BPP_ID,
    bppUri: process.env.ONDC_BPP_URI,
    callbackRetryCount: parseInt(process.env.ONDC_CALLBACK_RETRY_COUNT || '3'),
    callbackRetryDelay: parseInt(process.env.ONDC_CALLBACK_RETRY_DELAY || '5000')
  },
  store: {
    name: process.env.STORE_NAME || 'WooCommerce Store',
    gps: process.env.STORE_GPS || '12.956399,77.636803',
    locality: process.env.STORE_LOCALITY || 'Main Street',
    city: process.env.STORE_CITY || 'Bengaluru',
    areaCode: process.env.STORE_AREA_CODE || '560076',
    state: process.env.STORE_STATE || 'Karnataka',
    phone: process.env.STORE_PHONE || '9999999999',
    email: process.env.STORE_EMAIL || 'store@example.com',
    jurisdiction: process.env.STORE_JURISDICTION || 'Bengaluru',
    gstNumber: process.env.STORE_GST_NUMBER || 'GST_NUMBER',
    panNumber: process.env.STORE_PAN_NUMBER || 'PAN_NUMBER'
  },
  settlement: {
    beneficiaryName: process.env.SETTLEMENT_BENEFICIARY_NAME || 'Store',
    upiAddress: process.env.SETTLEMENT_UPI_ADDRESS || 'store@upi',
    accountNo: process.env.SETTLEMENT_ACCOUNT_NO || 'XXXXXXXXXX',
    ifscCode: process.env.SETTLEMENT_IFSC_CODE || 'XXXXXXXXX',
    bankName: process.env.SETTLEMENT_BANK_NAME || 'Bank Name',
    branchName: process.env.SETTLEMENT_BRANCH_NAME || 'Branch Name'
  }
};