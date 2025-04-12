const axios = require('axios');

async function testInit() {
  const payload = {
    "context": {
      "domain": "ONDC:RET10",
      "country": "IND",
      "city": "std:080",
      "action": "init",
      "core_version": "1.1.0",
      "bap_id": "buyer-app.ondc.org",
      "bap_uri": "https://buyer-app.ondc.org/protocol/v1",
      "bpp_id": "woocommerce1-test-adaptor.ondc.org",
      "bpp_uri": "https://woocommerce1-test-adaptor.ondc.org/protocol/v1",
      "transaction_id": "T2" + Date.now(),
      "message_id": "M2" + Date.now(),
      "timestamp": new Date().toISOString()
    },
    "message": {
      "order": {
        "provider": {
          "id": "woocommerce1-test-adaptor.ondc.org"
        },
        "items": [
          {
            "id": "I1", // Replace with actual product ID
            "quantity": {
              "count": 1
            },
            "fulfillment_id": "F1"
          }
        ],
        "billing": {
          "name": "Test Customer",
          "phone": "9999999999",
          "email": "test@example.com",
          "address": {
            "name": "Home",
            "building": "123 Test Building",
            "locality": "Test Locality",
            "city": "Bangalore",
            "state": "Karnataka",
            "country": "India",
            "area_code": "560001"
          }
        },
        "fulfillments": [
          {
            "id": "F1",
            "type": "Delivery",
            "end": {
              "location": {
                "address": {
                  "name": "Home",
                  "building": "123 Test Building",
                  "locality": "Test Locality",
                  "city": "Bangalore",
                  "state": "Karnataka",
                  "country": "India",
                  "area_code": "560001"
                }
              },
              "contact": {
                "phone": "9999999999"
              }
            }
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