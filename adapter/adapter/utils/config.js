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
    registryUrl: process.env.ONDC_REGISTRY_URL,
    gatewayUrl: process.env.ONDC_GATEWAY_URL,
    callbackRetryCount: parseInt(process.env.ONDC_CALLBACK_RETRY_COUNT || '3'),
    callbackRetryInterval: parseInt(process.env.ONDC_CALLBACK_RETRY_INTERVAL || '10000') // 10 seconds
  }
};