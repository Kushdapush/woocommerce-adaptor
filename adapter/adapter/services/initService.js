/**
 * ONDC Init Service
 * Business logic for handling init API requests
 */

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
  try {
    const { context, message } = request;
    
    // Map ONDC order to WooCommerce order
    const wooOrderData = mapOndcOrderToWooCommerce(message.order, context);
    
    // Create draft order in WooCommerce
    const wooOrder = await wooCommerceAPI.createOrder(wooOrderData);
    
    // Map WooCommerce response to ONDC format
    return mapWooCommerceResponseToOndc(wooOrder, context);
  } catch (error) {
    logger.error('Error in init service', { error: error.message });
    if (error.response && error.response.data) {
      logger.error('WooCommerce API error details', { details: error.response.data });
    }
    throw new ApiError(error.message, error.status || 500);
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
 * Map ONDC items to WooCommerce line items
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
  
  // Build fulfillments array
  const fulfillments = Array.from(fulfillmentIds).map(id => {
    return {
      id,
      type: wooOrder.shipping_lines[0]?.method_title || 'Delivery',
      provider_id: context.bpp_id,
      state: {
        descriptor: {
          code: 'Order-initiated'
        }
      },
      tracking: false
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
    
    return ondcItem;
  });

  // Generate price breakup for ONDC quote
  const breakup = generatePriceBreakup(wooOrder);

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
          id: context.bpp_id
        },
        items,
        fulfillments,
        billing: {
          name: `${wooOrder.billing.first_name} ${wooOrder.billing.last_name}`,
          address: {
            name: wooOrder.billing.address_1,
            building: wooOrder.billing.address_1.split(',')[0] || '',
            locality: wooOrder.billing.address_1.split(',')[1] || '',
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
          breakup
        },
        payment: {
          status: "NOT-PAID",
          type: "ON-ORDER",
          collected_by: "BAP"
        },
        id: String(wooOrder.id),
        state: "CREATED",
        created_at: wooOrder.date_created,
        updated_at: wooOrder.date_modified
      }
    }
  };
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

/**
 * Generate price breakup for ONDC quote
 * @param {Object} wooOrder - WooCommerce order object
 * @returns {Array} Price breakup array for ONDC
 */
const generatePriceBreakup = (wooOrder) => {
  const breakup = [];
  
  // Add item prices
  wooOrder.line_items.forEach(item => {
    breakup.push({
      title: item.name,
      price: {
        currency: "INR",
        value: String(parseFloat(item.subtotal))
      }
    });
  });
  
  // Add tax if present
  if (parseFloat(wooOrder.total_tax) > 0) {
    breakup.push({
      title: "Tax",
      price: {
        currency: "INR",
        value: String(parseFloat(wooOrder.total_tax))
      }
    });
  }
  
  // Add shipping if present
  if (wooOrder.shipping_total && parseFloat(wooOrder.shipping_total) > 0) {
    breakup.push({
      title: "Delivery Charges",
      price: {
        currency: "INR",
        value: String(parseFloat(wooOrder.shipping_total))
      }
    });
  }
  
  // Add discount if present
  if (wooOrder.discount_total && parseFloat(wooOrder.discount_total) > 0) {
    breakup.push({
      title: "Discount",
      price: {
        currency: "INR",
        value: String(-parseFloat(wooOrder.discount_total))
      }
    });
  }
  
  return breakup;
};

module.exports = {
  processInit
};