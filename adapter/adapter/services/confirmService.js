const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../utils/config');
const { ApiError } = require('../utils/errorHandler');
const wooCommerceAPI = require('../utils/wooCommerceAPI');
const callbackHandler = require('../utils/callbackHandler');

/**
 * Process ONDC confirm request
 * @param {Object} request - ONDC confirm request payload
 * @returns {Promise<Object>} ONDC on_confirm response
 */
const processConfirm = async (request) => {
  const { context, message } = request;
  
  try {
    logger.info('Starting to process confirm request', { 
      transactionId: context.transaction_id,
      messageId: context.message_id,
      action: context.action 
    });
    
    // Idempotency check - if we've already processed this transaction
    const existingOrder = await checkForExistingOrder(message.order.id, context.transaction_id);
    if (existingOrder) {
      logger.info('Found existing order, returning cached response', { 
        transactionId: context.transaction_id,
        orderId: existingOrder.id
      });
      return mapWooCommerceToOnConfirm(existingOrder, context);
    }
    
    // Validate order details
    await validateOrder(message.order, context);
    
    logger.info('Order validation passed, creating order in WooCommerce', {
      transactionId: context.transaction_id,
      orderId: message.order.id
    });
    
    // Map ONDC order to WooCommerce format
    const wooOrderData = mapOndcOrderToWooCommerce(message.order, context);
    
    // Create order in WooCommerce with pending status
    const wooOrder = await wooCommerceAPI.createOrder(wooOrderData);
    
    logger.info('Successfully created WooCommerce order', {
      transactionId: context.transaction_id,
      wooOrderId: wooOrder.id,
      ondcOrderId: message.order.id
    });
    
    // Add ONDC metadata to order
    await addOndcMetadata(wooOrder.id, context, message.order);
    
    // Generate on_confirm response
    const ondcResponse = mapWooCommerceToOnConfirm(wooOrder, context);
    
    return ondcResponse;
  } catch (error) {
    logger.error('Error in confirm service', { 
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
    }
    
    throw new ApiError(error.message, error.status || 500);
  }
};

/**
 * Send on_confirm callback to BAP
 * @param {Object} ondcResponse - ONDC on_confirm response
 * @returns {Promise<boolean>} Success status
 */
const sendOnConfirmCallback = async (ondcResponse) => {
  const { context } = ondcResponse;
  const transactionId = context.transaction_id;
  const orderId = ondcResponse.message.order.id;
  
  try {
    logger.info('Sending on_confirm callback to BAP', {
      transactionId,
      orderId,
      bapUri: context.bap_uri
    });
    
    // Use the callback handler to send and manage retries
    const result = await callbackHandler.sendCallback(
      `${context.bap_uri}/on_confirm`,
      ondcResponse,
      transactionId,
      'on_confirm'
    );
    
    if (result.success) {
      // Update order status to Accepted
      await updateOrderToAccepted(orderId, transactionId);
      
      logger.info('Successfully updated order to Accepted status', {
        transactionId,
        orderId
      });
      
      return true;
    } else {
      // If callback failed after retries, cancel the order
      await cancelOrder(context, '998', 'Order cancelled because of order confirmation failure');
      return false;
    }
  } catch (error) {
    logger.error('Error sending on_confirm callback', {
      transactionId,
      orderId,
      error: error.message
    });
    
    // Cancel the order if callback fails
    await cancelOrder(context, '998', 'Order cancelled because of order confirmation failure');
    return false;
  }
};

/**
 * Check if an order already exists
 * @param {string} orderId - Order ID from BAP
 * @param {string} transactionId - ONDC transaction ID
 * @returns {Promise<Object|null>} Existing order or null
 */
const checkForExistingOrder = async (orderId, transactionId) => {
  try {
    // First try by order ID
    const ordersByOrderId = await wooCommerceAPI.getOrders({
      meta_key: 'ondc_order_id',
      meta_value: orderId
    });
    
    if (ordersByOrderId && ordersByOrderId.length > 0) {
      return ordersByOrderId[0];
    }
    
    // Then try by transaction ID
    const ordersByTransactionId = await wooCommerceAPI.getOrders({
      meta_key: 'ondc_transaction_id',
      meta_value: transactionId
    });
    
    if (ordersByTransactionId && ordersByTransactionId.length > 0) {
      return ordersByTransactionId[0];
    }
    
    return null;
  } catch (error) {
    logger.warn('Error checking for existing order', {
      error: error.message,
      orderId,
      transactionId
    });
    return null;
  }
};

/**
 * Validate order details from confirm request
 * @param {Object} order - Order object from confirm request
 * @param {Object} context - ONDC context
 * @returns {Promise<boolean>} Validation result
 * @throws {ApiError} If validation fails
 */
const validateOrder = async (order, context) => {
  // Check if order ID is present
  if (!order.id) {
    throw new ApiError('Order ID is missing', 400);
  }
  
  // Check if payment is PAID for prepaid orders
  if (order.payment.type === 'ON-ORDER' && order.payment.status !== 'PAID') {
    throw new ApiError('Payment status must be PAID for ON-ORDER payment type', 400);
  }
  
  // Check for required fields
  if (!order.billing || !order.billing.name || !order.billing.address || !order.billing.phone) {
    throw new ApiError('Billing information is incomplete', 400);
  }
  
  if (!order.fulfillments || order.fulfillments.length === 0) {
    throw new ApiError('Fulfillment information is missing', 400);
  }
  
  // Check for items
  if (!order.items || order.items.length === 0) {
    throw new ApiError('Order items are missing', 400);
  }
  
  // Validate quote matches what was in on_init
  // NOTE: To do this properly, you'd need to retrieve the on_init response
  // For this implementation, we're assuming it's valid
  
  return true;
};

/**
 * Map ONDC order to WooCommerce format
 * @param {Object} ondcOrder - ONDC order from confirm
 * @param {Object} context - ONDC context
 * @returns {Object} WooCommerce order data
 */
const mapOndcOrderToWooCommerce = (ondcOrder, context) => {
  // Extract billing information
  const billing = {
    first_name: ondcOrder.billing.name.split(' ')[0] || ondcOrder.billing.name,
    last_name: ondcOrder.billing.name.split(' ').slice(1).join(' ') || '',
    address_1: ondcOrder.billing.address.building || '',
    address_2: ondcOrder.billing.address.locality || '',
    city: ondcOrder.billing.address.city,
    state: ondcOrder.billing.address.state,
    postcode: ondcOrder.billing.address.area_code,
    country: ondcOrder.billing.address.country,
    email: ondcOrder.billing.email,
    phone: ondcOrder.billing.phone
  };
  
  // Extract shipping information
  const shipping = ondcOrder.fulfillments[0]?.end?.location?.address 
    ? {
        first_name: ondcOrder.fulfillments[0].end.person?.name || billing.first_name,
        last_name: billing.last_name,
        address_1: ondcOrder.fulfillments[0].end.location.address.building || '',
        address_2: ondcOrder.fulfillments[0].end.location.address.locality || '',
        city: ondcOrder.fulfillments[0].end.location.address.city,
        state: ondcOrder.fulfillments[0].end.location.address.state,
        postcode: ondcOrder.fulfillments[0].end.location.address.area_code,
        country: ondcOrder.fulfillments[0].end.location.address.country,
        phone: ondcOrder.fulfillments[0].end.contact?.phone || billing.phone
      }
    : billing;
  
  // Map items to WooCommerce line items
  const line_items = mapLineItems(ondcOrder.items);
  
  // Map offers to coupon lines if present
  const coupon_lines = ondcOrder.offers ? 
    ondcOrder.offers.map(offer => ({ code: offer.id })) : [];
  
  // Create metadata for ONDC fields
  const meta_data = [
    { key: 'ondc_transaction_id', value: context.transaction_id },
    { key: 'ondc_message_id', value: context.message_id },
    { key: 'ondc_order_id', value: ondcOrder.id },
    { key: 'ondc_state', value: ondcOrder.state || 'Created' },
    { key: 'ondc_domain', value: context.domain }
  ];
  
  // Handle shipping lines
  const shipping_lines = ondcOrder.fulfillments.map(fulfillment => ({
    method_id: 'flat_rate',
    method_title: fulfillment.type || 'Delivery',
    total: ondcOrder.quote?.breakup?.find(item => 
      item['@ondc/org/item_id'] === fulfillment.id && 
      item['@ondc/org/title_type'] === 'delivery'
    )?.price?.value || '0',
    meta_data: [
      { key: 'ondc_fulfillment_id', value: fulfillment.id }
    ]
  }));
  
  // Prepare complete order data
  return {
    status: 'pending',
    billing,
    shipping,
    line_items,
    coupon_lines,
    meta_data,
    shipping_lines,
    customer_note: `ONDC Order via ${context.bap_id}. Order ID: ${ondcOrder.id}`
  };
};

/**
 * Map ONDC items to WooCommerce line items
 * @param {Array} ondcItems - ONDC items array
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
      
      // Add product ID mapping
      meta_data.push({
        key: 'ondc_item_id',
        value: mainItem.id
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
 * @param {string} ondcProductId - ONDC product ID
 * @returns {number} WooCommerce product ID
 */
const mapOndcProductIdToWooId = (ondcProductId) => {
  // This is a placeholder, implement your mapping logic
  if (ondcProductId.startsWith('I')) {
    const numericPart = ondcProductId.substring(1);
    const productId = parseInt(numericPart);
    if (!isNaN(productId)) {
      return productId;
    }
  }
  
  // Fallback logic if ID doesn't follow expected format
  return parseInt(ondcProductId.replace(/\D/g, '')) || 1;
};

/**
 * Add ONDC specific metadata to WooCommerce order
 * @param {number} orderId - WooCommerce order ID
 * @param {Object} context - ONDC context
 * @param {Object} ondcOrder - ONDC order object
 * @returns {Promise<Object>} Updated WooCommerce order
 */
const addOndcMetadata = async (orderId, context, ondcOrder) => {
  try {
    // Create metadata for ONDC specific fields
    const meta_data = [
      { key: 'ondc_payment_type', value: ondcOrder.payment.type },
      { key: 'ondc_payment_status', value: ondcOrder.payment.status },
      { key: 'ondc_payment_collected_by', value: ondcOrder.payment.collected_by },
      { key: 'ondc_created_at', value: ondcOrder.created_at || new Date().toISOString() },
      { key: 'ondc_updated_at', value: ondcOrder.updated_at || new Date().toISOString() }
    ];
    
    // Add transaction terms if present
    if (ondcOrder.tags) {
      const bppTerms = ondcOrder.tags.find(tag => tag.code === 'bpp_terms');
      if (bppTerms) {
        meta_data.push({
          key: 'ondc_bpp_terms',
          value: JSON.stringify(bppTerms)
        });
      }
      
      const bapTerms = ondcOrder.tags.find(tag => tag.code === 'bap_terms');
      if (bapTerms) {
        meta_data.push({
          key: 'ondc_bap_terms',
          value: JSON.stringify(bapTerms)
        });
      }
    }
    
    // Update the order with additional metadata
    const updatedOrder = await wooCommerceAPI.updateOrder(orderId, { meta_data });
    
    logger.info('Added ONDC metadata to order', {
      orderId,
      transactionId: context.transaction_id
    });
    
    return updatedOrder;
  } catch (error) {
    logger.error('Error adding ONDC metadata to order', {
      error: error.message,
      orderId,
      transactionId: context.transaction_id
    });
    
    // Continue without failing the whole process
    return null;
  }
};

/**
 * Update WooCommerce order to Accepted status
 * @param {string} orderId - ONDC order ID
 * @param {string} transactionId - ONDC transaction ID
 * @returns {Promise<Object>} Updated WooCommerce order
 */
const updateOrderToAccepted = async (orderId, transactionId) => {
  try {
    // Find WooCommerce order by ONDC order ID
    const orders = await wooCommerceAPI.getOrders({
      meta_key: 'ondc_order_id',
      meta_value: orderId
    });
    
    if (!orders || orders.length === 0) {
      logger.warn('Order not found for updating to Accepted status', {
        ondcOrderId: orderId,
        transactionId
      });
      return null;
    }
    
    const wooOrderId = orders[0].id;
    
    // Update order status and metadata
    const updatedOrder = await wooCommerceAPI.updateOrder(wooOrderId, {
      status: 'processing', // WooCommerce status equivalent to ONDC "Accepted"
      meta_data: [
        { key: 'ondc_state', value: 'Accepted' },
        { key: 'ondc_updated_at', value: new Date().toISOString() }
      ]
    });
    
    logger.info('Updated order to Accepted status', {
      wooOrderId,
      ondcOrderId: orderId,
      transactionId
    });
    
    return updatedOrder;
  } catch (error) {
    logger.error('Error updating order to Accepted status', {
      error: error.message,
      ondcOrderId: orderId,
      transactionId
    });
    
    throw error;
  }
};

/**
 * Cancel order with reason code
 * @param {Object} context - ONDC context
 * @param {string} reasonCode - Cancellation reason code
 * @param {string} reasonDescription - Cancellation reason description
 * @returns {Promise<boolean>} Success status
 */
const cancelOrder = async (context, reasonCode, reasonDescription) => {
  const transactionId = context.transaction_id;
  
  try {
    // Find WooCommerce order by transaction ID
    const orders = await wooCommerceAPI.getOrders({
      meta_key: 'ondc_transaction_id',
      meta_value: transactionId
    });
    
    if (!orders || orders.length === 0) {
      logger.warn('Order not found for cancellation', {
        transactionId
      });
      return false;
    }
    
    const wooOrderId = orders[0].id;
    
    // Update order status and metadata
    await wooCommerceAPI.updateOrder(wooOrderId, {
      status: 'cancelled',
      meta_data: [
        { key: 'ondc_state', value: 'Cancelled' },
        { key: 'ondc_cancellation_reason', value: reasonCode },
        { key: 'ondc_cancellation_description', value: reasonDescription },
        { key: 'ondc_updated_at', value: new Date().toISOString() }
      ]
    });
    
    logger.info('Order cancelled', {
      wooOrderId,
      transactionId,
      reasonCode,
      reasonDescription
    });
    
    return true;
  } catch (error) {
    logger.error('Error cancelling order', {
      error: error.message,
      transactionId,
      reasonCode
    });
    
    return false;
  }
};

/**
 * Map WooCommerce order to ONDC on_confirm format
 * @param {Object} wooOrder - WooCommerce order
 * @param {Object} context - ONDC context
 * @returns {Object} ONDC on_confirm response
 */
const mapWooCommerceToOnConfirm = (wooOrder, context) => {
  // Extract ONDC order ID from metadata
  const ondcOrderIdMeta = wooOrder.meta_data.find(meta => meta.key === 'ondc_order_id');
  const ondcOrderId = ondcOrderIdMeta ? ondcOrderIdMeta.value : wooOrder.id.toString();
  
  // Extract ONDC state from metadata or map from WooCommerce status
  const ondcStateMeta = wooOrder.meta_data.find(meta => meta.key === 'ondc_state');
  let ondcState = ondcStateMeta ? ondcStateMeta.value : 'Created';
  
  // If WooCommerce status is 'processing', set ONDC state to 'Accepted'
  if (wooOrder.status === 'processing' && ondcState === 'Created') {
    ondcState = 'Accepted';
  }
  
  // Build items array
  const items = buildItemsArray(wooOrder);
  
  // Build fulfillments array
  const fulfillments = buildFulfillmentsArray(wooOrder);
  
  // Build quote with breakup
  const quote = buildQuote(wooOrder);
  
  // Build payment object
  const payment = buildPayment(wooOrder);
  
  // Build billing information
  const billing = {
    name: `${wooOrder.billing.first_name} ${wooOrder.billing.last_name}`.trim(),
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
  };
  
  // Build cancellation terms
  const cancellationTerms = buildCancellationTerms(wooOrder);
  
  // Build tags with terms
  const tags = buildTags(wooOrder);
  
  // Build full ONDC response
  return {
    context: {
      ...context,
      action: 'on_confirm',
      timestamp: new Date().toISOString(),
      message_id: `ondc-message-${wooOrder.id}`,
      bpp_id: context.bpp_id,
      bpp_uri: context.bpp_uri
    },
    message: {
      order: {
        id: ondcOrderId,
        state: ondcState,
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
        billing,
        quote,
        payment,
        cancellation_terms: cancellationTerms,
        tags,
        created_at: wooOrder.date_created,
        updated_at: wooOrder.date_modified || new Date().toISOString()
      }
    }
  };
};

/**
 * Build items array for on_confirm response
 * @param {Object} wooOrder - WooCommerce order
 * @returns {Array} ONDC items array
 */
const buildItemsArray = (wooOrder) => {
  return wooOrder.line_items.flatMap(item => {
    // Find ONDC item ID from metadata
    const ondcItemIdMeta = item.meta_data.find(meta => meta.key === 'ondc_item_id');
    const ondcItemId = ondcItemIdMeta ? ondcItemIdMeta.value : `I${item.product_id}`;
    
    // Find fulfillment ID from metadata
    const fulfillmentIdMeta = item.meta_data.find(meta => meta.key === 'ondc_fulfillment_id');
    const fulfillmentId = fulfillmentIdMeta ? fulfillmentIdMeta.value : 'F1';
    
    // Find parent item ID from metadata
    const parentItemIdMeta = item.meta_data.find(meta => meta.key === 'ondc_parent_item_id');
    const parentItemId = parentItemIdMeta ? parentItemIdMeta.value : null;
    
    // Find customization metadata
    const customizationMetas = item.meta_data.filter(meta => 
      meta.key.startsWith('customization_')
    );
    
    // Create main item
    const mainItem = {
      id: ondcItemId,
      fulfillment_id: fulfillmentId,
      quantity: {
        count: item.quantity
      }
    };
    
    if (parentItemId) {
      mainItem.parent_item_id = parentItemId;
    }
    
    // Add tags if needed
    mainItem.tags = [
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
    
    // If no customizations, just return the main item
    if (customizationMetas.length === 0) {
      return [mainItem];
    }
    
    // Create customization items
    const customizationItems = customizationMetas.map(meta => {
      try {
        const keyParts = meta.key.split('_');
        const groupId = keyParts[1];
        const customData = JSON.parse(meta.value);
        
        return {
          id: customData.id,
          fulfillment_id: fulfillmentId,
          quantity: {
            count: customData.quantity
          },
          parent_item_id: parentItemId || ondcItemId,
          tags: [
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
                  value: groupId
                }
              ]
            }
          ]
        };
      } catch (error) {
        logger.warn('Error parsing customization metadata', {
          error: error.message,
          metaKey: meta.key,
          metaValue: meta.value
        });
        return null;
      }
    }).filter(Boolean); // Remove any null items
    
    return [mainItem, ...customizationItems];
  });
};

/**
 * Build fulfillments array for on_confirm response
 * @param {Object} wooOrder - WooCommerce order
 * @returns {Array} ONDC fulfillments array
 */
const buildFulfillmentsArray = (wooOrder) => {
  // Extract all fulfillment IDs from line items
  const fulfillmentIds = new Set();
  
  wooOrder.line_items.forEach(item => {
    const fulfillmentIdMeta = item.meta_data.find(meta => meta.key === 'ondc_fulfillment_id');
    if (fulfillmentIdMeta && fulfillmentIdMeta.value) {
      fulfillmentIds.add(fulfillmentIdMeta.value);
    }
  });
  
  // If no fulfillment IDs found, use a default
  if (fulfillmentIds.size === 0) {
    fulfillmentIds.add('F1');
  }
  
  // Now build fulfillment objects for each ID
  return Array.from(fulfillmentIds).map(id => {
    return {
      id,
      '@ondc/org/provider_name': config.store.name || 'Store',
      state: {
        descriptor: {
          code: 'Pending'
        }
      },
      type: 'Delivery',
      tracking: true,
      '@ondc/org/TAT': 'PT60M',
      start: {
        location: {
          id: 'L1',
          descriptor: {
            name: config.store.name || 'Store'
          },
          gps: config.store.gps || '12.956399,77.636803',
          address: {
            locality: config.store.locality || 'Locality',
            city: config.store.city || 'City',
            area_code: config.store.areaCode || '560076',
            state: config.store.state || 'State'
          }
        },
        time: {
          range: {
            start: new Date(Date.now() + 30 * 60000).toISOString(), // 30 minutes from now
            end: new Date(Date.now() + 60 * 60000).toISOString()    // 60 minutes from now
          }
        },
        instructions: {
          code: '2',
          name: 'ONDC order',
          short_desc: 'ONDC',
          long_desc: 'Order via ONDC network'
        },
        contact: {
          phone: config.store.phone || '9999999999',
          email: config.store.email || 'store@example.com'
        }
      },
      end: {
        location: {
          gps: '12.453544,77.928379', // This should ideally come from the order
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
        time: {
          range: {
            start: new Date(Date.now() + 60 * 60000).toISOString(),   // 60 minutes from now
            end: new Date(Date.now() + 90 * 60000).toISOString()      // 90 minutes from now
          }
        },
        person: {
          name: `${wooOrder.shipping.first_name} ${wooOrder.shipping.last_name}`.trim()
        },
        contact: {
          phone: wooOrder.shipping.phone || wooOrder.billing.phone,
          email: wooOrder.billing.email
        }
      }
    };
  });
};

/**
 * Build quote object with breakup for on_confirm response
 * @param {Object} wooOrder - WooCommerce order
 * @returns {Object} ONDC quote object
 */
const buildQuote = (wooOrder) => {
  const breakup = [];
  
  // Add line items to breakup
  wooOrder.line_items.forEach(item => {
    // Find ONDC item ID from metadata
    const ondcItemIdMeta = item.meta_data.find(meta => meta.key === 'ondc_item_id');
    const ondcItemId = ondcItemIdMeta ? ondcItemIdMeta.value : `I${item.product_id}`;
    
    // Find parent item ID if it exists
    const parentItemIdMeta = item.meta_data.find(meta => meta.key === 'ondc_parent_item_id');
    const parentItemId = parentItemIdMeta ? parentItemIdMeta.value : null;
    
    // Create item entry
    breakup.push({
      '@ondc/org/item_id': ondcItemId,
      '@ondc/org/item_quantity': {
        count: item.quantity
      },
      title: item.name,
      '@ondc/org/title_type': 'item',
      price: {
        currency: 'INR',
        value: String(parseFloat(item.subtotal))
      },
      item: {
        ...(parentItemId && { parent_item_id: parentItemId }),
        price: {
          currency: 'INR',
          value: String(parseFloat(item.price))
        }
      }
    });
    
    // Add tax for this item if applicable
    if (parseFloat(item.total_tax) > 0) {
      breakup.push({
        '@ondc/org/item_id': ondcItemId,
        title: 'Tax',
        '@ondc/org/title_type': 'tax',
        price: {
          currency: 'INR',
          value: String(parseFloat(item.total_tax))
        }
      });
    }
  });
  
  // Add shipping charge to breakup
  wooOrder.shipping_lines.forEach(shipping => {
    // Find ONDC fulfillment ID from metadata
    const fulfillmentIdMeta = shipping.meta_data.find(meta => meta.key === 'ondc_fulfillment_id');
    const fulfillmentId = fulfillmentIdMeta ? fulfillmentIdMeta.value : 'F1';
    
    breakup.push({
      '@ondc/org/item_id': fulfillmentId,
      title: 'Delivery charges',
      '@ondc/org/title_type': 'delivery',
      price: {
        currency: 'INR',
        value: String(parseFloat(shipping.total))
      }
    });
    
    // Add tax on shipping if applicable
    if (shipping.total_tax && parseFloat(shipping.total_tax) > 0) {
      breakup.push({
        '@ondc/org/item_id': fulfillmentId,
        title: 'Tax',
        '@ondc/org/title_type': 'tax',
        price: {
          currency: 'INR',
          value: String(parseFloat(shipping.total_tax))
        },
        item: {
          tags: [
            {
              code: 'quote',
              list: [
                {
                  code: 'type',
                  value: 'fulfillment'
                }
              ]
            }
          ]
        }
      });
    }
    
    // Add standard packing charge
    breakup.push({
      '@ondc/org/item_id': fulfillmentId,
      title: 'Packing charges',
      '@ondc/org/title_type': 'packing',
      price: {
        currency: 'INR',
        value: '25.00'
      }
    });
    
    // Add convenience fee
    breakup.push({
      '@ondc/org/item_id': fulfillmentId,
      title: 'Convenience Fee',
      '@ondc/org/title_type': 'misc',
      price: {
        currency: 'INR',
        value: '10.00'
      }
    });
  });
  
  // Add discount if applicable
  if (wooOrder.discount_total && parseFloat(wooOrder.discount_total) > 0) {
    breakup.push({
      '@ondc/org/item_id': wooOrder.line_items[0] ? 
        `I${wooOrder.line_items[0].product_id}` : 'I1',
      title: 'Discount',
      '@ondc/org/title_type': 'discount',
      price: {
        currency: 'INR',
        value: String(-parseFloat(wooOrder.discount_total))
      }
    });
  }
  
  // Build the complete quote object
  return {
    price: {
      currency: 'INR',
      value: String(parseFloat(wooOrder.total))
    },
    breakup,
    ttl: 'PT1H'
  };
};

/**
 * Build payment object for on_confirm response
 * @param {Object} wooOrder - WooCommerce order
 * @returns {Object} ONDC payment object
 */
const buildPayment = (wooOrder) => {
  // Extract payment status from metadata or use default
  const paymentStatusMeta = wooOrder.meta_data.find(meta => meta.key === 'ondc_payment_status');
  const paymentStatus = paymentStatusMeta ? paymentStatusMeta.value : 'PAID';
  
  // Extract payment type from metadata or use default
  const paymentTypeMeta = wooOrder.meta_data.find(meta => meta.key === 'ondc_payment_type');
  const paymentType = paymentTypeMeta ? paymentTypeMeta.value : 'ON-ORDER';
  
  // Extract collected by from metadata or use default
  const collectedByMeta = wooOrder.meta_data.find(meta => meta.key === 'ondc_payment_collected_by');
  const collectedBy = collectedByMeta ? collectedByMeta.value : 'BAP';
  
  return {
    uri: 'https://ondc.transaction.com/payment',
    tl_method: 'http/get',
    params: {
      currency: 'INR',
      transaction_id: `${wooOrder.id}`,
      amount: wooOrder.total
    },
    status: paymentStatus,
    type: paymentType,
    collected_by: collectedBy,
    '@ondc/org/buyer_app_finder_fee_type': 'percent',
    '@ondc/org/buyer_app_finder_fee_amount': '3',
    '@ondc/org/settlement_basis': 'delivery',
    '@ondc/org/settlement_window': 'P1D',
    '@ondc/org/withholding_amount': '10.00',
    '@ondc/org/settlement_details': [
      {
        settlement_counterparty: 'seller-app',
        settlement_phase: 'sale-amount',
        beneficiary_name: config.settlement?.beneficiaryName || 'Store',
        settlement_type: 'upi',
        upi_address: config.settlement?.upiAddress || 'store@upi',
        settlement_bank_account_no: config.settlement?.accountNo || 'XXXXXXXXXX',
        settlement_ifsc_code: config.settlement?.ifscCode || 'XXXXXXXXX',
        bank_name: config.settlement?.bankName || 'Bank',
        branch_name: config.settlement?.branchName || 'Branch'
      }
    ]
  };
};

/**
 * Build cancellation terms for on_confirm response
 * @param {Object} wooOrder - WooCommerce order
 * @returns {Array} ONDC cancellation terms array
 */
const buildCancellationTerms = (wooOrder) => {
  // Calculate cancellation fees based on order total
  const orderTotal = parseFloat(wooOrder.total);
  const tier1Fee = (orderTotal * 0.0).toFixed(2);   // 0% of order total
  const tier2Fee = (orderTotal * 0.1).toFixed(2);   // 10% of order total
  const tier3Fee = (orderTotal * 0.2).toFixed(2);   // 20% of order total
  
  return [
    {
      fulfillment_state: {
        descriptor: {
          code: 'Pending',
          short_desc: '002'
        }
      },
      cancellation_fee: {
        amount: {
          currency: 'INR',
          value: tier1Fee
        }
      }
    },
    {
      fulfillment_state: {
        descriptor: {
          code: 'Packed',
          short_desc: '001,003'
        }
      },
      cancellation_fee: {
        amount: {
          currency: 'INR',
          value: tier2Fee
        }
      }
    },
    {
      fulfillment_state: {
        descriptor: {
          code: 'Order-picked-up',
          short_desc: '001,003'
        }
      },
      cancellation_fee: {
        amount: {
          currency: 'INR',
          value: tier2Fee
        }
      }
    },
    {
      fulfillment_state: {
        descriptor: {
          code: 'Out-for-delivery',
          short_desc: '009'
        }
      },
      cancellation_fee: {
        amount: {
          currency: 'INR',
          value: tier1Fee
        }
      }
    },
    {
      fulfillment_state: {
        descriptor: {
          code: 'Out-for-delivery',
          short_desc: '011,012,013,014,015'
        }
      },
      cancellation_fee: {
        amount: {
          currency: 'INR',
          value: tier3Fee
        }
      }
    }
  ];
};

/**
 * Build tags array with terms for on_confirm response
 * @param {Object} wooOrder - WooCommerce order
 * @returns {Array} ONDC tags array
 */
const buildTags = (wooOrder) => {
  // Try to extract BPP terms from metadata
  const bppTermsMeta = wooOrder.meta_data.find(meta => meta.key === 'ondc_bpp_terms');
  let bppTerms = null;
  
  if (bppTermsMeta) {
    try {
      bppTerms = JSON.parse(bppTermsMeta.value);
    } catch (error) {
      // If parsing fails, we'll use default values below
    }
  }
  
  // Try to extract BAP terms from metadata
  const bapTermsMeta = wooOrder.meta_data.find(meta => meta.key === 'ondc_bap_terms');
  let bapTerms = null;
  
  if (bapTermsMeta) {
    try {
      bapTerms = JSON.parse(bapTermsMeta.value);
    } catch (error) {
      // If parsing fails, we'll use default values below
    }
  }
  
  // If terms not found in metadata, use defaults
  const defaultBppTerms = {
    code: 'bpp_terms',
    list: [
      {
        code: 'max_liability_cap',
        value: '10000.00'
      },
      {
        code: 'max_liability',
        value: '2'
      },
      {
        code: 'mandatory_arbitration',
        value: 'false'
      },
      {
        code: 'court_jurisdiction',
        value: config.store?.jurisdiction || 'Bengaluru'
      },
      {
        code: 'delay_interest',
        value: '7.50'
      },
      {
        code: 'np_type',
        value: 'MSN'
      },
      {
        code: 'tax_number',
        value: config.store?.gstNumber || 'GST_NUMBER'
      },
      {
        code: 'provider_tax_number',
        value: config.store?.panNumber || 'PAN_NUMBER'
      },
      {
        code: 'accept_bap_terms',
        value: 'Y'
      }
    ]
  };
  
  const defaultBapTerms = {
    code: 'bap_terms',
    list: [
      {
        code: 'static_terms',
        value: 'https://github.com/ONDC-Official/protocol-network-extension/discussions/79'
      },
      {
        code: 'tax_number',
        value: 'GST_NUMBER_OF_BAP'
      }
    ]
  };
  
  // Use parsed terms if available, otherwise use defaults
  return [
    bppTerms || defaultBppTerms,
    bapTerms || defaultBapTerms
  ];
};

module.exports = {
  processConfirm,
  sendOnConfirmCallback,
  mapWooCommerceToOnConfirm,
  cancelOrder
};