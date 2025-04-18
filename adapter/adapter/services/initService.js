const { createOrder } = require('../utils/orderHelper');
const logger = require('../utils/logger');
const config = require('../utils/config');
const { ApiError } = require('../utils/errorHandler');
const wooCommerceAPI = require('../utils/wooCommerceAPI');

/**
 * Transform ONDC order to WooCommerce format
 * @param {Object} request - ONDC request
 * @returns {Object} WooCommerce order data
 */
const transformOndcToWooCommerceOrder = (request) => {
  const order = request.message.order;
  return {
    status: 'pending', // Changed from 'processing' to 'pending'
    payment_method: 'cod',
    payment_method_title: 'Cash on Delivery',
    billing: {
      first_name: order.billing.name,
      email: order.billing.email,
      phone: order.billing.phone,
      address_1: order.billing.address.building,
      address_2: order.billing.address.street,
      city: order.billing.address.city,
      state: order.billing.address.state,
      postcode: order.billing.address.area_code,
      country: order.billing.address.country
    },
    shipping: {
      first_name: order.billing.name,
      address_1: order.billing.address.building,
      address_2: order.billing.address.street,
      city: order.billing.address.city,
      state: order.billing.address.state,
      postcode: order.billing.address.area_code,
      country: order.billing.address.country
    },
    line_items: order.items.map(item => ({
      product_id: item.id,
      quantity: item.quantity.count
    })),
    meta_data: [
      {
        key: 'ondc_order_id',
        value: request.context.transaction_id
      },
      {
        key: 'ondc_message_id',
        value: request.context.message_id
      }
    ]
  };
};

/**
 * Process ONDC init request
 * @param {Object} request - ONDC init request payload
 * @returns {Promise<Object>} ONDC on_init response
 */
const processInit = async (request) => {
  const transactionId = request.context.transaction_id;
  
  try {
    const wcOrderData = transformOndcToWooCommerceOrder(request);
    const order = await wooCommerceAPI.createOrder(wcOrderData);
    
    logger.info('Init request processed successfully', {
      transactionId,
      orderId: order.id
    });

    return transformToOndcResponse(order, request.context);
  } catch (error) {
    logger.error('Init processing failed', {
      transactionId,
      error: error.message
    });
    throw new ApiError(`WooCommerce API error: ${error.message}`);
  }
};

module.exports = {
  processInit,
  transformOndcToWooCommerceOrder // Exported for testing
};