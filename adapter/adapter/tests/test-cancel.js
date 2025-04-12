const axios = require('axios');

async function testCancel() {
  // First, we need an order ID to cancel.
  // This should be an existing order ID in your WooCommerce system
  // You can either hardcode an ID from a previous test or implement logic to get the latest order
  const orderId = 'O1' + Date.now(); // Replace with actual order ID if needed

  const payload = {
    "context": {
      "domain": "ONDC:RET10",
      "country": "IND",
      "city": "std:080",
      "action": "cancel",
      "core_version": "1.1.0",
      "bap_id": "buyer-app.ondc.org",
      "bap_uri": "https://buyer-app.ondc.org/protocol/v1",
      "bpp_id": "woocommerce1-test-adaptor.ondc.org",
      "bpp_uri": "https://woocommerce1-test-adaptor.ondc.org/protocol/v1",
      "transaction_id": "T2" + Date.now(), // Add timestamp to ensure uniqueness
      "message_id": "M4" + Date.now(),     // Add timestamp to ensure uniqueness
      "timestamp": new Date().toISOString()
    },
    "message": {
      "order_id": orderId,
      "cancellation_reason_id": "001", // Valid reason codes: 001-009
      "descriptor": {
        "name": "Order cancellation",
        "short_desc": "Order cancelled by buyer",
        "tags": [
          {
            "code": "params",
            "list": [
              {
                "code": "force",
                "value": "no"
              }
            ]
          }
        ]
      }
    }
  };

  try {
    console.log('Sending cancel request to:', 'http://localhost:3000/api/v1/cancel');
    console.log('Transaction ID:', payload.context.transaction_id);
    console.log('Order ID:', payload.message.order_id);
    console.log('Cancellation Reason:', payload.message.cancellation_reason_id);
    
    const response = await axios.post('http://localhost:3000/api/v1/cancel', payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Optional: Function to get an existing order ID from WooCommerce
// This would require additional setup to query your WooCommerce API
async function getExistingOrderId() {
  try {
    // Implementation to query WooCommerce for latest order with ONDC metadata
    // This is just a placeholder for the concept
    return 'O1'; // Return a default value for now
  } catch (error) {
    console.error('Error getting existing order ID:', error.message);
    return 'O1'; // Fallback to default
  }
}

testCancel();