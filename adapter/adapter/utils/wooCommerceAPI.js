const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;
const config = require('./config');
const logger = require('./logger');

// Initialize WooCommerce API client
const wooCommerce = new WooCommerceRestApi({
  url: config.woocommerce.url,
  consumerKey: config.woocommerce.consumerKey,
  consumerSecret: config.woocommerce.consumerSecret,
  version: config.woocommerce.version,
  timeout: config.woocommerce.timeout
});

/**
 * Get products from WooCommerce
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} WooCommerce products response
 */
const getProducts = async (params = {}) => {
  try {
    const response = await wooCommerce.get('products', params);
    return response.data;
  } catch (error) {
    logger.error('Error fetching products from WooCommerce', { error: error.message });
    throw error;
  }
};

/**
 * Get product by ID from WooCommerce
 * @param {number} productId - Product ID
 * @returns {Promise<Object>} WooCommerce product
 */
const getProductById = async (productId) => {
  try {
    const response = await wooCommerce.get(`products/${productId}`);
    return response.data;
  } catch (error) {
    logger.error('Error fetching product by ID from WooCommerce', { 
      error: error.message,
      productId 
    });
    throw error;
  }
};

/**
 * Get product variations from WooCommerce
 * @param {number} productId - Product ID
 * @returns {Promise<Object>} WooCommerce product variations
 */
const getProductVariations = async (productId) => {
  try {
    const response = await wooCommerce.get(`products/${productId}/variations`);
    return response.data;
  } catch (error) {
    logger.error('Error fetching product variations from WooCommerce', { 
      error: error.message,
      productId 
    });
    throw error;
  }
};

/**
 * Create a draft order in WooCommerce
 * @param {Object} orderData - WooCommerce order data
 * @returns {Promise<Object>} Created WooCommerce order
 */
const createOrder = async (orderData) => {
  try {
    logger.info('Creating order in WooCommerce', { orderData: { ...orderData, line_items: 'Redacted for logging' } });
    const response = await wooCommerce.post('orders', orderData);
    return response.data;
  } catch (error) {
    logger.error('Error creating order in WooCommerce', { 
      error: error.message,
      orderData: { ...orderData, line_items: 'Redacted for logging' }
    });
    throw error;
  }
};

/**
 * Update an order in WooCommerce
 * @param {number} orderId - Order ID
 * @param {Object} orderData - WooCommerce order data to update
 * @returns {Promise<Object>} Updated WooCommerce order
 */
const updateOrder = async (orderId, orderData) => {
  try {
    logger.info('Updating order in WooCommerce', { 
      orderId,
      orderData: { ...orderData, line_items: 'Redacted for logging' }
    });
    const response = await wooCommerce.put(`orders/${orderId}`, orderData);
    return response.data;
  } catch (error) {
    logger.error('Error updating order in WooCommerce', { 
      error: error.message,
      orderId,
      orderData: { ...orderData, line_items: 'Redacted for logging' }
    });
    throw error;
  }
};

/**
 * Get an order from WooCommerce
 * @param {number} orderId - Order ID
 * @returns {Promise<Object>} WooCommerce order
 */
const getOrder = async (orderId) => {
  try {
    const response = await wooCommerce.get(`orders/${orderId}`);
    return response.data;
  } catch (error) {
    logger.error('Error fetching order from WooCommerce', { 
      error: error.message,
      orderId 
    });
    throw error;
  }
};

/**
 * Get orders from WooCommerce with query parameters
 * @param {Object} params - Query parameters
 * @returns {Promise<Array>} Array of WooCommerce orders
 */
const getOrders = async (params = {}) => {
  try {
    logger.info('Fetching orders from WooCommerce', { params });
    const response = await wooCommerce.get('orders', params);
    logger.info('Successfully fetched orders from WooCommerce', { count: response.data.length });
    return response.data;
  } catch (error) {
    logger.error('Error fetching orders from WooCommerce', { 
      error: error.message,
      params 
    });
    throw error;
  }
};

/**
 * Get product categories from WooCommerce
 * @param {Object} params - Query parameters
 * @returns {Promise<Array>} Array of WooCommerce product categories
 */
const getCategories = async (params = {}) => {
  try {
    logger.info('Fetching product categories from WooCommerce', { params });
    const response = await wooCommerce.get('products/categories', params);
    logger.info('Successfully fetched product categories', { count: response.data.length });
    return response.data;
  } catch (error) {
    logger.error('Error fetching product categories from WooCommerce', { 
      error: error.message,
      params 
    });
    throw error;
  }
};

module.exports = {
  getProducts,
  getProductById,
  getProductVariations,
  createOrder,
  updateOrder,
  getOrder,
  getCategories,
  getOrders  
};

