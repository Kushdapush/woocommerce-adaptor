const wooCommerceAPI = require('../utils/wooCommerceAPI');
const logger = require('../utils/logger');
const config = require('../utils/config');
const { ApiError } = require('../utils/errorHandler');

/**
 * Process ONDC init request
 * @param {Object} request - ONDC init request payload
 * @returns {Promise<Object>} ONDC on_init response
 */
const processInit = async (request) => {
  const { context, message } = request;
  
  try {
    logger.info('Starting to process init request', { 
      transactionId: context.transaction_id,
      messageId: context.message_id,
      action: context.action 
    });
    
    // Idempotency check - if we've already processed this transaction, return the existing response
    const existingOrder = await checkForExistingTransaction(context.transaction_id);
    if (existingOrder) {
      logger.info('Found existing order for transaction, returning cached response', { 
        transactionId: context.transaction_id,
        messageId: context.message_id,
        orderId: existingOrder.id
      });
      return mapWooCommerceResponseToOndc(existingOrder, context);
    }
    
    logger.info('No existing order found, creating new order in WooCommerce', {
      transactionId: context.transaction_id,
      messageId: context.message_id
    });
    
    // Map ONDC order to WooCommerce order
    const wooOrderData = mapOndcOrderToWooCommerce(message.order, context);
    
    // Create draft order in WooCommerce
    logger.info('Sending order creation request to WooCommerce', {
      transactionId: context.transaction_id,
      orderDetails: {
        billing: wooOrderData.billing?.email,
        items: wooOrderData.line_items?.length || 0,
        status: wooOrderData.status
      }
    });
    
    const wooOrder = await wooCommerceAPI.createOrder(wooOrderData);
    
    logger.info('Successfully created WooCommerce order', {
      transactionId: context.transaction_id,
      wooOrderId: wooOrder.id,
      wooOrderStatus: wooOrder.status
    });
    
    // Update order status metadata to track ONDC specific status
    await updateOrderOndcStatus(wooOrder.id, 'CREATED', context.transaction_id);
    
    // Map WooCommerce response to ONDC format
    const ondcResponse = mapWooCommerceResponseToOndc(wooOrder, context);
    
    logger.info('Generated ONDC on_init response', {
      transactionId: context.transaction_id,
      messageId: ondcResponse.context.message_id,
      ondcOrderId: ondcResponse.message.order.id,
      ondcOrderState: ondcResponse.message.order.state
    });
    
    return ondcResponse;
  } catch (error) {
    logger.error('Error in init service', { 
      transactionId: context?.transaction_id,
      error: error.message,
      stack: error.stack
    });
    
    if (error.response && error.response.data) {
      logger.error('WooCommerce API error details', { 
        transactionId: context?.transaction_id,
        details: error.response.data,
        status: error.response.status
      });
      throw new ApiError(`WooCommerce API error: ${error.response.status}`, error.response.status);
    } else if (error.request) {
      logger.error('Network error, no response received', { 
        transactionId: context?.transaction_id,
        error: error.message 
      });
      throw new ApiError('Network error, could not reach WooCommerce', 503);
    }
    
    throw new ApiError(error.message, error.status || 500);
  }
};

/**
 * Check if we've already processed this transaction
 * @param {string} transactionId - ONDC transaction ID
 * @returns {Promise<Object|null>} Existing WooCommerce order or null
 */
const checkForExistingTransaction = async (transactionId) => {
  try {
    // Search for orders with meta_data matching this transaction ID
    logger.debug('Checking for existing transaction', { transactionId });
    
    const orders = await wooCommerceAPI.getOrders({
      meta_key: 'ondc_transaction_id',
      meta_value: transactionId
    });
    
    if (orders && orders.length > 0) {
      logger.info('Found existing order for transaction', { 
        transactionId,
        orderId: orders[0].id,
        status: orders[0].status
      });
      return orders[0];
    }
    
    logger.debug('No existing order found for transaction', { transactionId });
    return null;
  } catch (error) {
    logger.warn('Error checking for existing transaction', { 
      error: error.message,
      transactionId
    });
    return null; // Continue with new order creation if check fails
  }
};

/**
 * Update order with ONDC specific status
 * @param {number} orderId - WooCommerce order ID
 * @param {string} ondcStatus - ONDC order status
 * @param {string} transactionId - ONDC transaction ID
 * @returns {Promise<Object>} Updated WooCommerce order
 */
const updateOrderOndcStatus = async (orderId, ondcStatus, transactionId) => {
  try {
    logger.info('Updating order ONDC status', { 
      orderId, 
      ondcStatus,
      transactionId
    });
    
    // Add ONDC status as meta data
    const meta_data = [
      { key: 'ondc_order_status', value: ondcStatus },
      { key: 'ondc_status_updated_at', value: new Date().toISOString() }
    ];
    
    // Add order note for status change
    const note = `ONDC Status updated to ${ondcStatus}`;
    
    // Update the order in WooCommerce
    const updatedOrder = await wooCommerceAPI.updateOrder(orderId, { 
      meta_data,
      customer_note: note
    });
    
    logger.info('Successfully updated order ONDC status', { 
      orderId, 
      ondcStatus,
      transactionId
    });
    
    return updatedOrder;
  } catch (error) {
    logger.error('Error updating order ONDC status', { 
      error: error.message,
      orderId,
      ondcStatus,
      transactionId
    });
    
    // Don't throw error, as this is a non-critical operation
    return null;
  }
};

/**
 * Map ONDC order to WooCommerce order format
 * @param {Object} ondcOrder - ONDC order object
 * @param {Object} context - ONDC context object
 * @returns {Object} WooCommerce order data
 */
const mapOndcOrderToWooCommerce = (ondcOrder, context) => {
  // Extract customer billing information
  const billing = {
    first_name: ondcOrder.billing.name.split(' ')[0] || ondcOrder.billing.name,
    last_name: ondcOrder.billing.name.split(' ')[1] || '',
    address_1: `${ondcOrder.billing.address.building}, ${ondcOrder.billing.address.locality}`,
    city: ondcOrder.billing.address.city,
    state: ondcOrder.billing.address.state,
    postcode: ondcOrder.billing.address.area_code,
    country: ondcOrder.billing.address.country,
    email: ondcOrder.billing.email,
    phone: ondcOrder.billing.phone
  };

  // Extract shipping information from fulfillments
  const shipping = ondcOrder.fulfillments[0]?.end?.location?.address 
    ? {
        first_name: ondcOrder.billing.name.split(' ')[0] || ondcOrder.billing.name,
        last_name: ondcOrder.billing.name.split(' ')[1] || '',
        address_1: `${ondcOrder.fulfillments[0].end.location.address.building}, ${ondcOrder.fulfillments[0].end.location.address.locality}`,
        city: ondcOrder.fulfillments[0].end.location.address.city,
        state: ondcOrder.fulfillments[0].end.location.address.state,
        postcode: ondcOrder.fulfillments[0].end.location.address.area_code,
        country: ondcOrder.fulfillments[0].end.location.address.country,
        phone: ondcOrder.fulfillments[0].end.contact?.phone || ondcOrder.billing.phone
      }
    : billing;

  // Map ONDC items to WooCommerce line items
  const line_items = mapLineItems(ondcOrder.items);

  // Map ONDC offers to WooCommerce coupons
  const coupon_lines = ondcOrder.offers ? 
    ondcOrder.offers.map(offer => ({ code: offer.id })) : [];

  // Create metadata to store ONDC specific information
  const meta_data = [
    { key: 'ondc_transaction_id', value: context.transaction_id },
    { key: 'ondc_message_id', value: context.message_id },
    { key: 'ondc_bpp_id', value: context.bpp_id },
    { key: 'ondc_domain', value: context.domain }
  ];

  // Determine shipping method based on fulfillment type
  const shipping_lines = [{
    method_id: 'flat_rate',
    method_title: ondcOrder.fulfillments[0]?.type || 'Delivery',
    meta_data: [
      { key: 'ondc_fulfillment_id', value: ondcOrder.fulfillments[0]?.id || 'F1' }
    ]
  }];

  // Prepare the WooCommerce order data
  return {
    status: 'pending',
    billing,
    shipping,
    line_items,
    coupon_lines,
    meta_data,
    shipping_lines,
    customer_note: `ONDC Order initialized via ${context.bap_id}`
  };
};

/**
 * Map ONDC items to WooCommerce line items with support for parent_item_id and customization
 * @param {Array} ondcItems - Array of ONDC items
 * @returns {Array} WooCommerce line items
 */
const mapLineItems = (ondcItems) => {
  // Group items by parent_item_id to handle customizations
  const itemsByParent = {};
  
  ondcItems.forEach(item => {
    const parentId = item.parent_item_id || 'main';
    if (!itemsByParent[parentId]) {
      itemsByParent[parentId] = {
        main: null,
        customizations: []
      };
    }
    
    // Check if item is a customization or main item
    const isCustomization = item.tags?.some(tag => 
      tag.code === 'type' && 
      tag.list?.some(listItem => 
        listItem.code === 'type' && listItem.value === 'customization'
      )
    );
    
    if (isCustomization) {
      itemsByParent[parentId].customizations.push(item);
    } else {
      itemsByParent[parentId].main = item;
    }
  });
  
  // Convert grouped items to WooCommerce line items
  return Object.entries(itemsByParent)
    .filter(([_, group]) => group.main !== null)
    .map(([parentId, group]) => {
      const mainItem = group.main;
      
      // Collect all customizations as meta data
      const meta_data = group.customizations.map(customization => {
        // Extract customization group if available
        const customizationGroup = customization.tags?.find(tag => 
          tag.code === 'parent'
        )?.list?.find(listItem => 
          listItem.code === 'id'
        )?.value || 'custom';
        
        return {
          key: `customization_${customizationGroup}_${customization.id}`,
          value: JSON.stringify({
            id: customization.id,
            group: customizationGroup,
            quantity: customization.quantity.count
          })
        };
      });
      
      // Add parent_item_id as meta data if it exists
      if (mainItem.parent_item_id) {
        meta_data.push({
          key: 'ondc_parent_item_id',
          value: mainItem.parent_item_id
        });
      }
      
      // Add fulfillment_id as meta data
      meta_data.push({
        key: 'ondc_fulfillment_id',
        value: mainItem.fulfillment_id
      });
      
      // Return the line item object
      return {
        product_id: mapOndcProductIdToWooId(mainItem.id),
        quantity: mainItem.quantity.count,
        meta_data
      };
    });
};

/**
 * Convert ONDC product ID to WooCommerce product ID
 * @param {string} ondcProductId - The ONDC product ID
 * @returns {number} WooCommerce product ID
 */
const mapOndcProductIdToWooId = (ondcProductId) => {
  // This should be implemented based on your product mapping logic
  // This is a placeholder implementation
  return parseInt(ondcProductId.replace(/\D/g, '')) || 1;
};

/**
 * Map WooCommerce response back to ONDC format
 * @param {Object} wooOrder - WooCommerce order object
 * @param {Object} context - Original ONDC context
 * @returns {Object} ONDC formatted response
 */
const mapWooCommerceResponseToOndc = (wooOrder, context) => {
  // Extract fulfillment IDs from the order
  const fulfillmentIds = new Set();
  
  // Get fulfillment IDs from line items meta data
  wooOrder.line_items.forEach(item => {
    const fulfillmentMeta = item.meta_data.find(meta => meta.key === 'ondc_fulfillment_id');
    if (fulfillmentMeta && fulfillmentMeta.value) {
      fulfillmentIds.add(fulfillmentMeta.value);
    }
  });
  
  // Get fulfillment ID from shipping lines
  wooOrder.shipping_lines.forEach(shipping => {
    const fulfillmentMeta = shipping.meta_data.find(meta => meta.key === 'ondc_fulfillment_id');
    if (fulfillmentMeta && fulfillmentMeta.value) {
      fulfillmentIds.add(fulfillmentMeta.value);
    }
  });
  
  // Get ONDC status from meta data or default to "CREATED"
  const ondcStatusMeta = wooOrder.meta_data.find(meta => meta.key === 'ondc_order_status');
  const ondcStatus = ondcStatusMeta ? ondcStatusMeta.value : "CREATED";
  
  // Build fulfillments array
  const fulfillments = Array.from(fulfillmentIds).map(id => {
    return {
      id,
      type: wooOrder.shipping_lines[0]?.method_title || 'Delivery',
      tracking: false,
      end: {
        location: {
          gps: "12.453544,77.928379", // This should be dynamically calculated
          address: {
            name: wooOrder.shipping.address_1.split(',')[0] || '',
            building: wooOrder.shipping.address_1,
            locality: wooOrder.shipping.address_2 || '',
            city: wooOrder.shipping.city,
            state: wooOrder.shipping.state,
            country: wooOrder.shipping.country,
            area_code: wooOrder.shipping.postcode
          }
        },
        contact: {
          phone: wooOrder.shipping.phone || wooOrder.billing.phone
        }
      },
      tags: [
        {
          code: "rto_action",
          list: [
            {
              code: "return_to_origin",
              value: "yes"
            }
          ]
        }
      ]
    };
  });

  // Map line items to ONDC format
  const items = wooOrder.line_items.map(item => {
    // Find fulfillment ID for this item
    const fulfillmentMeta = item.meta_data.find(meta => meta.key === 'ondc_fulfillment_id');
    const fulfillmentId = fulfillmentMeta ? fulfillmentMeta.value : fulfillments[0]?.id;
    
    // Find parent item ID if it exists
    const parentItemMeta = item.meta_data.find(meta => meta.key === 'ondc_parent_item_id');
    const parentItemId = parentItemMeta ? parentItemMeta.value : null;
    
    // Check if item has customization tags
    const ondcItem = {
      id: mapWooProductIdToOndcId(item.product_id, item.id),
      quantity: {
        count: item.quantity
      },
      fulfillment_id: fulfillmentId
    };
    
    if (parentItemId) {
      ondcItem.parent_item_id = parentItemId;
    }
    
    // Add customization tags if needed (can be determined from meta data)
    const isCustomization = item.meta_data.some(meta => 
      meta.key.startsWith('customization_')
    );
    
    if (isCustomization) {
      // Get customization group
      const groupMeta = item.meta_data.find(meta => 
        meta.key.startsWith('customization_')
      );
      
      if (groupMeta) {
        const customizationData = JSON.parse(groupMeta.value);
        ondcItem.tags = [
          {
            code: "type",
            list: [
              {
                code: "type",
                value: "customization"
              }
            ]
          },
          {
            code: "parent",
            list: [
              {
                code: "id",
                value: customizationData.group
              }
            ]
          }
        ];
      }
    } else {
      ondcItem.tags = [
        {
          code: "type",
          list: [
            {
              code: "type",
              value: "item"
            }
          ]
        }
      ];
    }
    
    return ondcItem;
  });

  // Generate price breakup for ONDC quote
  const breakup = generatePriceBreakup(wooOrder);

  // Generate cancellation terms
  const cancellationTerms = generateCancellationTerms(wooOrder.total);

  // Build full ONDC response
  return {
    context: {
      ...context,
      action: 'on_init',
      timestamp: new Date().toISOString(),
      message_id: `ondc-message-${wooOrder.id}`,
      bpp_id: context.bpp_id,
      bpp_uri: context.bpp_uri
    },
    message: {
      order: {
        provider: {
          id: context.bpp_id,
          locations: [
            {
              id: "L1" // Should be dynamically set based on the provider location
            }
          ]
        },
        items,
        fulfillments,
        billing: {
          name: `${wooOrder.billing.first_name} ${wooOrder.billing.last_name}`,
          address: {
            name: wooOrder.billing.address_1.split(',')[0] || '',
            building: wooOrder.billing.address_1,
            locality: wooOrder.billing.address_2 || '',
            city: wooOrder.billing.city,
            state: wooOrder.billing.state,
            country: wooOrder.billing.country,
            area_code: wooOrder.billing.postcode
          },
          email: wooOrder.billing.email,
          phone: wooOrder.billing.phone,
          created_at: wooOrder.date_created,
          updated_at: wooOrder.date_modified
        },
        quote: {
          price: {
            currency: "INR",
            value: String(wooOrder.total)
          },
          breakup,
          ttl: "PT1H" // 1 hour time to live for the quote
        },
        payment: {
          type: "ON-ORDER",
          collected_by: "BPP",
          uri: "https://yourpaymentgateway.com/pg", // Should be configured based on your payment gateway
          status: "NOT-PAID",
          "@ondc/org/buyer_app_finder_fee_type": "percent",
          "@ondc/org/buyer_app_finder_fee_amount": "3",
          "@ondc/org/settlement_basis": "delivery",
          "@ondc/org/settlement_window": "P1D",
          "@ondc/org/withholding_amount": "10.00",
          "tags": [
            {
              "code": "bpp_collect",
              "list": [
                {
                  "code": "success",
                  "value": "Y"
                },
                {
                  "code": "error",
                  "value": ".."
                }
              ]
            }
          ],
          "@ondc/org/settlement_details": [
            {
              "settlement_counterparty": "seller-app",
              "settlement_phase": "sale-amount",
              "settlement_type": "upi",
              "beneficiary_name": "Your Business Name",
              "upi_address": "your-upi@provider",
              "settlement_bank_account_no": "XXXXXXXXXX",
              "settlement_ifsc_code": "XXXXXXXXX",
              "bank_name": "Your Bank",
              "branch_name": "Your Branch"
            }
          ]
        },
        cancellation_terms: cancellationTerms,
        tags: [
          {
            "code": "bpp_terms",
            "list": [
              {
                "code": "max_liability",
                "value": "2"
              },
              {
                "code": "max_liability_cap",
                "value": "10000.00"
              },
              {
                "code": "mandatory_arbitration",
                "value": "false"
              },
              {
                "code": "court_jurisdiction",
                "value": "Bengaluru"
              },
              {
                "code": "delay_interest",
                "value": "7.50"
              },
              {
                "code": "tax_number",
                "value": "YOUR_GST_NUMBER" // Should be configured from env variables
              },
              {
                "code": "provider_tax_number",
                "value": "YOUR_PAN_NUMBER" // Should be configured from env variables
              }
            ]
          }
        ],
        id: String(wooOrder.id),
        state: ondcStatus,
        created_at: wooOrder.date_created,
        updated_at: wooOrder.date_modified
      }
    }
  };
};

/**
 * Generate cancellation terms based on order total
 * @param {number} orderTotal - Total order amount
 * @returns {Array} Cancellation terms
 */
const generateCancellationTerms = (orderTotal) => {
  const total = parseFloat(orderTotal);
  const cancellationTerms = [
    {
      fulfillment_state: {
        descriptor: {
          code: "Pending",
          short_desc: "002"
        }
      },
      cancellation_fee: {
        percentage: "0.00",
        amount: {
          currency: "INR",
          value: "0.00"
        }
      }
    },
    {
      fulfillment_state: {
        descriptor: {
          code: "Packed",
          short_desc: "001,003"
        }
      },
      cancellation_fee: {
        percentage: "10.00",
        amount: {
          currency: "INR",
          value: (total * 0.1).toFixed(2)
        }
      }
    },
    {
      fulfillment_state: {
        descriptor: {
          code: "Order-picked-up",
          short_desc: "001,003"
        }
      },
      cancellation_fee: {
        percentage: "10.00",
        amount: {
          currency: "INR",
          value: (total * 0.1).toFixed(2)
        }
      }
    },
    {
      fulfillment_state: {
        descriptor: {
          code: "Out-for-delivery",
          short_desc: "009"
        }
      },
      cancellation_fee: {
        percentage: "0.00",
        amount: {
          currency: "INR",
          value: "0.00"
        }
      }
    },
    {
      fulfillment_state: {
        descriptor: {
          code: "Out-for-delivery",
          short_desc: "010,011,012,013,014,015"
        }
      },
      cancellation_fee: {
        percentage: "20.00",
        amount: {
          currency: "INR",
          value: (total * 0.2).toFixed(2)
        }
      }
    }
  ];
  
  return cancellationTerms;
};

/**
 * Generate price breakup for ONDC quote
 * @param {Object} wooOrder - WooCommerce order object
 * @returns {Array} Price breakup array for ONDC
 */
const generatePriceBreakup = (wooOrder) => {
  const breakup = [];
  
  // Add item prices
  wooOrder.line_items.forEach(item => {
    // Get the parent item ID if it exists
    const parentItemMeta = item.meta_data.find(meta => meta.key === 'ondc_parent_item_id');
    const parentItemId = parentItemMeta ? parentItemMeta.value : null;
    
    // Find if it's a customization
    const isCustomization = item.meta_data.some(meta => 
      meta.key.startsWith('customization_')
    );
    
    // Determine title type
    const titleType = isCustomization ? "customization" : "item";
    
    breakup.push({
      "@ondc/org/item_id": mapWooProductIdToOndcId(item.product_id, item.id),
      "@ondc/org/item_quantity": {
        count: item.quantity
      },
      "title": item.name,
      "@ondc/org/title_type": "item",
      "price": {
        "currency": "INR",
        "value": String(parseFloat(item.subtotal))
      },
      "item": {
        "price": {
          "currency": "INR",
          "value": String(parseFloat(item.price))
        },
        ...(parentItemId && { "parent_item_id": parentItemId }),
        "quantity": {
          "available": {
            "count": "99" // This should be dynamically determined from inventory
          },
          "maximum": {
            "count": "99" // This should be dynamically determined from inventory
          }
        },
        ...(isCustomization && {
          "tags": [
            {
              "code": "type",
              "list": [
                {
                  "code": "type",
                  "value": "customization"
                }
              ]
            },
            {
              "code": "parent",
              "list": [
                {
                  "code": "id",
                  "value": item.meta_data.find(meta => 
                    meta.key.startsWith('customization_')
                  )?.value.split('_')[1] || "CG1"
                }
              ]
            }
          ]
        }),
        ...(!isCustomization && {
          "tags": [
            {
              "code": "type",
              "list": [
                {
                  "code": "type",
                  "value": "item"
                }
              ]
            }
          ]
        })
      }
    });
    
    // Add tax for each item
    if (item.total_tax && parseFloat(item.total_tax) > 0) {
      breakup.push({
        "@ondc/org/item_id": mapWooProductIdToOndcId(item.product_id, item.id),
        "title": "Tax",
        "@ondc/org/title_type": "tax",
        "price": {
          "currency": "INR",
          "value": String(parseFloat(item.total_tax))
        },
        ...(parentItemId && {
          "item": {
            "parent_item_id": parentItemId,
            "tags": isCustomization ? [
              {
                "code": "type",
                "list": [
                  {
                    "code": "type",
                    "value": "customization"
                  }
                ]
              },
              {
                "code": "parent",
                "list": [
                  {
                    "code": "id",
                    "value": item.meta_data.find(meta => 
                      meta.key.startsWith('customization_')
                    )?.value.split('_')[1] || "CG1"
                  }
                ]
              }
            ] : [
              {
                "code": "type",
                "list": [
                  {
                    "code": "type",
                    "value": "item"
                  }
                ]
              }
            ]
          }
        })
      });
    }
  });
  
  // Add shipping if present
  if (wooOrder.shipping_total && parseFloat(wooOrder.shipping_total) > 0) {
    breakup.push({
      "@ondc/org/item_id": wooOrder.shipping_lines[0]?.meta_data.find(meta => 
        meta.key === 'ondc_fulfillment_id'
      )?.value || "F1",
      "title": "Delivery charges",
      "@ondc/org/title_type": "delivery",
      "price": {
        "currency": "INR",
        "value": String(parseFloat(wooOrder.shipping_total))
      }
    });
    
    // Add tax on shipping
    if (wooOrder.shipping_tax && parseFloat(wooOrder.shipping_tax) > 0) {
      breakup.push({
        "@ondc/org/item_id": wooOrder.shipping_lines[0]?.meta_data.find(meta => 
          meta.key === 'ondc_fulfillment_id'
        )?.value || "F1",
        "title": "Tax",
        "@ondc/org/title_type": "tax",
        "price": {
          "currency": "INR",
          "value": String(parseFloat(wooOrder.shipping_tax))
        },
        "item": {
          "tags": [
            {
              "code": "quote",
              "list": [
                {
                  "code": "type",
                  "value": "fulfillment"
                }
              ]
            }
          ]
        }
      });
    }
  }
  
// Add packing charges - You can configure this as needed
breakup.push({
  "@ondc/org/item_id": wooOrder.shipping_lines[0]?.meta_data.find(meta => 
    meta.key === 'ondc_fulfillment_id'
  )?.value || "F1",
  "title": "Packing charges",
  "@ondc/org/title_type": "packing",
  "price": {
    "currency": "INR",
    "value": "25.00" // This should be configurable
  }
});

// Add convenience fee if applicable
breakup.push({
  "@ondc/org/item_id": wooOrder.shipping_lines[0]?.meta_data.find(meta => 
    meta.key === 'ondc_fulfillment_id'
  )?.value || "F1",
  "title": "Convenience Fee",
  "@ondc/org/title_type": "misc",
  "price": {
    "currency": "INR",
    "value": "10.00" // This should be configurable
  }
});

// Add discount if present
if (wooOrder.discount_total && parseFloat(wooOrder.discount_total) > 0) {
  breakup.push({
    "@ondc/org/item_id": wooOrder.line_items[0]?.product_id ? 
      mapWooProductIdToOndcId(wooOrder.line_items[0].product_id, wooOrder.line_items[0].id) : "I1",
    "title": "Discount",
    "@ondc/org/title_type": "discount",
    "price": {
      "currency": "INR",
      "value": String(-parseFloat(wooOrder.discount_total))
    }
  });
}

return breakup;
};

/**
* Map WooCommerce product ID to ONDC product ID
* @param {number} wooProductId - WooCommerce product ID
* @param {number} lineItemId - WooCommerce line item ID
* @returns {string} ONDC product ID
*/
const mapWooProductIdToOndcId = (wooProductId, lineItemId) => {
// This should be implemented based on your product mapping logic
// This is a placeholder implementation
return `I${wooProductId}`;
};

module.exports = {
processInit
};