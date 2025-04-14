const axios = require('axios');

async function testConfirm() {
  const payload = {
    "context": {
      "domain": "ONDC:RET10",
      "country": "IND",
      "city": "std:080",
      "action": "confirm",
      "core_version": "1.1.0",
      "bap_id": "buyer-app.ondc.org",
      "bap_uri": "https://buyer-app.ondc.org/protocol/v1",
      "bpp_id": "woocommerce1-test-adaptor.ondc.org",
      "bpp_uri": "https://woocommerce1-test-adaptor.ondc.org/protocol/v1",
      "transaction_id": "T2" + Date.now(), // Add timestamp to ensure uniqueness
      "message_id": "M3" + Date.now(),     // Add timestamp to ensure uniqueness
      "timestamp": new Date().toISOString()
    },
    "message": {
      "order": {
        "id": "O1" + Date.now(), // Add timestamp to ensure uniqueness
        "provider": {
          "id": "woocommerce1-test-adaptor.ondc.org",
          "locations": [
            {
              "id": "L1"
            }
          ]
        },
        "items": [
          {
            "id": "I1",
            "fulfillment_id": "F1",
            "quantity": {
              "count": 1
            }
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
                  "building": "12355 Test Building",
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
        ],
        "quote": {
          "price": {
            "currency": "INR",
            "value": "100.00"
          },
          "breakup": [
            {
              "@ondc/org/item_id": "I1",
              "@ondc/org/item_quantity": {
                "count": 1
              },
              "title": "Test Product",
              "@ondc/org/title_type": "item",
              "price": {
                "currency": "INR",
                "value": "80.00"
              }
            },
            {
              "@ondc/org/item_id": "F1",
              "title": "Delivery charges",
              "@ondc/org/title_type": "delivery",
              "price": {
                "currency": "INR",
                "value": "20.00"
              }
            }
          ]
        },
        "payment": {
          "type": "ON-ORDER",
          "status": "PAID",
          "collected_by": "BAP",
          "@ondc/org/buyer_app_finder_fee_type": "percent",
          "@ondc/org/buyer_app_finder_fee_amount": "3"
        }
      }
    }
  };

  try {
    console.log('Sending confirm request to:', 'http://localhost:3000/api/v1/confirm');
    console.log('Transaction ID:', payload.context.transaction_id);
    console.log('Order ID:', payload.message.order.id);
    
    const response = await axios.post('http://localhost:3000/api/v1/confirm', payload, {
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

testConfirm();