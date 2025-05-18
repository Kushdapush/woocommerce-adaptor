// Create a file named emergency-cancel.js in your project root directory

const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;
const path = require('path');

// Try to load configuration
let config;
try {
  // Attempt to load config from your existing config file
  config = require('./utils/config');
} catch (error) {
  // Fallback to hardcoded config if needed
  console.log('Could not load config file, using default values');
  config = {
    woocommerce: {
      // Fill in your actual WooCommerce config values here
      url: 'http://localhost/wordpress2', // e.g., 'https://yourstore.com'
      consumer_key: 'ck_2d5fdd163befd8ef514f6eb3008aecd39fa4d28f',
      consumer_secret: 'cs_e7d2c4516dc1fe46bc0e0199d136f8bb00e1e36c'
    }
  };
}

// Create WooCommerce API client
const woocommerce = new WooCommerceRestApi({
  url: config.woocommerce.url,
  consumerKey: config.woocommerce.consumer_key,
  consumerSecret: config.woocommerce.consumer_secret,
  version: 'wc/v3',
  queryStringAuth: true
});

async function cancelOrder(orderId) {
  try {
    console.log(`Attempting to cancel order ${orderId}`);
    console.log(`Using WooCommerce URL: ${config.woocommerce.url}`);
    
    // First get the current order
    const order = await woocommerce.get(`orders/${orderId}`);
    console.log(`Current order status: ${order.data.status}`);
    
    // Update to cancelled status
    const result = await woocommerce.put(`orders/${orderId}`, {
      status: 'cancelled',
      customer_note: 'Order cancelled directly via emergency script'
    });
    
    console.log(`Updated order status: ${result.data.status}`);
    
    if (result.data.status === 'cancelled') {
      console.log('Cancellation successful!');
    } else {
      console.log(`Warning: Status is ${result.data.status}, not 'cancelled'`);
    }
  } catch (error) {
    console.error('Error cancelling order:', error.message);
    if (error.response) {
      console.error('API response:', {
        status: error.response.status,
        data: error.response.data
      });
    }
  }
}

// Get order ID from command line
const orderId = process.argv[2];
if (!orderId) {
  console.error('Please provide an order ID');
  process.exit(1);
}

// Run the cancellation
cancelOrder(orderId)
  .then(() => console.log('Script completed'))
  .catch(error => console.error('Script failed:', error.message));