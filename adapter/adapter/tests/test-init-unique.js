const axios = require('axios');

async function testInit() {
  // Generate unique identifiers to avoid idempotency issues
  const now = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const timestamp = new Date().toISOString();
  
  // Create a unique order for each test
  const uniqueId = `${randomStr}${now}`;
  
  const payload = {
    "context": {
      "domain": "retail",
      "action": "init",
      "core_version": "1.0.0",
      "bap_id": "woocommerce-test-adaptor.ondc.org",
      "bap_uri": "https://buyer-app.ondc.org/callback",
      "bpp_id": "woocommerce-test-adaptor.ondc.org",
      "bpp_uri": "http://localhost:3000/api/v1",
      "transaction_id": `T_${randomStr}_${now}`,
      "message_id": `M_${randomStr}_${now}`,
      "timestamp": timestamp,
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
        ],
        "billing": {
          "name": `Test Customer ${uniqueId}`,
          "phone": `9999${Math.floor(Math.random() * 10000).toString().padStart(5, '0')}`,
          "email": `test${uniqueId}@example.com`,
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
            "id": "fulfillment-1",
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
                "phone": `9999${Math.floor(Math.random() * 10000).toString().padStart(5, '0')}`,
                "email": `test${uniqueId}@example.com`
              }
            }
          }
        ],
        "payment": {
          "type": "ON-ORDER",
          "status": "NOT-PAID",
          "collected_by": "BAP"
        }
      }
    }
  };

  try {
    console.log(`Sending init request with transaction_id: ${payload.context.transaction_id}`);
    console.log(`Using unique customer: ${payload.message.order.billing.name}`);
    console.log(`Using unique email: ${payload.message.order.billing.email}`);
    
    const response = await axios.post('http://localhost:3000/api/v1/init', payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    
    // Wait a moment and then check for the order
    console.log('Waiting 3 seconds for order processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('You should now refresh your WooCommerce orders page to see the new order.');
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Execute the test
testInit();