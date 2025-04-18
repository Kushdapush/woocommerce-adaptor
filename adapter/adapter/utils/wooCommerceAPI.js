const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;
const config = require('./config');
const logger = require('./logger');

class WooCommerceHandler {
    constructor() {
        this.client = new WooCommerceRestApi({
            url: config.woocommerce.url,
            consumerKey: config.woocommerce.consumerKey,
            consumerSecret: config.woocommerce.consumerSecret,
            version: config.woocommerce.version || 'wc/v3',
            queryStringAuth: true
        });
    }

    async verifyConnection() {
        try {
            const response = await this.client.get('');
            logger.info('WooCommerce API connection successful', {
                namespaces: response.data?.namespaces || [],
                status: response.status
            });
            logger.info('WooCommerce API connection verified successfully');
            return true;
        } catch (error) {
            logger.error('WooCommerce connection failed', { error: error.message });
            throw error;
        }
    }

    async createOrder(orderData) {
        try {
            const response = await this.client.post('orders', orderData);
            logger.info('Order created successfully', {
                orderId: response.data.id,
                status: response.data.status
            });
            return response.data;
        } catch (error) {
            logger.error('Order creation failed', {
                error: error.message,
                orderData: JSON.stringify(orderData)
            });
            throw error;
        }
    }

    async getOrders(params = {}) {
        try {
            const response = await this.client.get('orders', {
                per_page: 20,
                ...params
            });
            
            logger.info('Retrieved orders successfully', {
                count: response.data.length,
                params: JSON.stringify(params)
            });
            
            return response.data;
        } catch (error) {
            logger.error('Failed to get orders', {
                error: error.message,
                params: JSON.stringify(params)
            });
            throw error;
        }
    }

    async getOrder(orderId) {
        try {
            // Handle both numeric and string IDs
            const cleanId = String(orderId).replace(/[^0-9]/g, '');
            if (!cleanId) {
                throw new Error('Invalid order ID format');
            }

            const response = await this.client.get(`orders/${cleanId}`);
            logger.info('Retrieved order successfully', { orderId: cleanId });
            return response.data;
        } catch (error) {
            logger.error('Failed to get order', {
                orderId,
                error: error.message
            });
            throw error;
        }
    }

    async updateOrder(orderId, data) {
        try {
            const response = await this.client.put(`orders/${orderId}`, data);
            logger.info('Order updated successfully', {
                orderId,
                newStatus: data.status
            });
            return response.data;
        } catch (error) {
            logger.error('Failed to update order', { orderId, error: error.message });
            throw error;
        }
    }

    async cancelOrder(orderId, reason = '') {
        try {
            const data = {
                status: 'cancelled',
                customer_note: reason || 'Cancelled via ONDC'
            };
            
            const response = await this.updateOrder(orderId, data);
            logger.info('Order cancelled successfully', { orderId });
            return response;
        } catch (error) {
            logger.error('Failed to cancel order', { orderId, error: error.message });
            throw error;
        }
    }
}

// Create singleton instance
const wooCommerceAPI = new WooCommerceHandler();

// Initialize connection
(async () => {
    try {
        await wooCommerceAPI.verifyConnection();
    } catch (error) {
        logger.error('Initial WooCommerce setup failed', { error: error.message });
    }
})();

module.exports = wooCommerceAPI;

