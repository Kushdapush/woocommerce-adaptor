const axios = require('axios');
const logger = require('../utils/logger');

async function testInitOrder16() {
  // Generate unique identifiers
  const now = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const timestamp = new Date().toISOString();
  
  const payload = {
    "context": {
      "domain": "ONDC:RET10",
      "action": "init",
      "core_version": "1.1.0",
      "bap_id": "buyer-app.ondc.org",
      "bap_uri": "http://localhost:3000",
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
          "id": "SIVA-ONDC-STORE-1"
        },
        "items": [
          {
            "id": "test-product-2", // Different product for order 16
            "quantity": {
              "count": 2  // Order 2 items
            },
            "price": {
              "currency": "INR",
              "value": "200.00"  // Different price
            }
          }
        ],
        "billing": {
          "name": `Order16 Test Customer ${randomStr}`,
          "phone": `9999${Math.floor(Math.random() * 10000).toString().padStart(5, '0')}`,
          "email": `order16.test.${randomStr}@example.com`,
          "address": {
            "door": "456", // Different address
            "name": "Office",
            "building": "Tech Park",
            "street": "Electronics City",
            "locality": "Phase 1",
            "city": "Bangalore",
            "state": "Karnataka",
            "country": "India",
            "area_code": "560100"
          }
        },
        "fulfillments": [
          {
            "id": `f_${randomStr}`,
            "type": "Delivery",
            "end": {
              "location": {
                "gps": "12.8458,77.5929", // Different location
                "address": {
                  "door": "456",
                  "name": "Office",
                  "building": "Tech Park",
                  "street": "Electronics City",
                  "locality": "Phase 1",
                  "city": "Bangalore",
                  "state": "Karnataka",
                  "country": "India",
                  "area_code": "560100"
                }
              },
              "contact": {
                "phone": `9999${Math.floor(Math.random() * 10000).toString().padStart(5, '0')}`,
                "email": `order16.test.${randomStr}@example.com`
              }
            }
          }
        ],
        "payment": {
          "type": "ON-ORDER",
          "params": {
            "amount": "200.00",
            "currency": "INR"
          },
          "status": "NOT-PAID"
        }
      }
    }
  };

  try {
    console.log('\n=== Creating Order #16 ===');
    console.log('Transaction ID:', payload.context.transaction_id);
    console.log('Customer:', payload.message.order.billing.name);
    console.log('Email:', payload.message.order.billing.email);
    console.log('Amount:', payload.message.order.payment.params.amount);

    const response = await axios.post('http://localhost:3000/api/v1/init', payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('\n=== Response ===');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));

    return {
      success: true,
      transactionId: payload.context.transaction_id,
      response: response.data
    };
  } catch (error) {
    console.error('\n=== Error ===');
    console.error('Message:', error.message);
    console.error('Response:', error.response?.data);
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  testInitOrder16().catch(console.error);
}

module.exports = testInitOrder16;