const axios = require('axios');

async function testInit() {
  const payload = {
    "context": {
      "domain": "retail",
      "action": "init",
      "core_version": "1.0.0",
      "bap_id": "woocommerce-test-adaptor.ondc.org",
      "bap_uri": "https://buyer-app.ondc.org/callback",
      "bpp_id": "woocommerce-test-adaptor.ondc.org",
      "bpp_uri": "http://localhost:3000/api/v1",
      "transaction_id": "T_20250404_123456",
      "message_id": "M_20250404_123456",
      "timestamp": "2025-04-04T12:34:56Z",
      "country": "IND",
      "city": "std:080"
    },
    "message": {
      "order": {
        "provider": {
          "id": "woocommerce-test-adaptor.ondc.org"
        },
        "items": [
          {
            "id": "product-1",
            "quantity": {
              "count": 1
            },
            "fulfillment_id": "fulfillment-1"
          }
        ]
      }
    }
  };

  try {
    const response = await axios.post('http://localhost:3000/api/v1/init', payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testInit();