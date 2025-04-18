const logger = require('../utils/logger');
const wooCommerceAPI = require('../utils/wooCommerceAPI');
const { ApiError } = require('../utils/errorHandler');

const validateCancellation = async (orderId, cancellationReasonId, fulfillmentId, context) => {
    try {
        // Get order details
        const order = await wooCommerceAPI.getOrder(orderId);
        
        // Check if order exists
        if (!order) {
            return {
                valid: false,
                reason: 'Order not found',
                errorCode: '40001',
                finalFailure: true
            };
        }

        // Check if order can be cancelled
        const cancellableStatuses = ['pending', 'processing', 'on-hold'];
        if (!cancellableStatuses.includes(order.status)) {
            return {
                valid: false,
                reason: `Order cannot be cancelled in status: ${order.status}`,
                errorCode: '30009',
                finalFailure: true
            };
        }

        return { valid: true };
    } catch (error) {
        throw new Error(`Error during validation: ${error.message}`);
    }
};

const processCancellation = async (orderId, cancellationReasonId, fulfillmentId, context) => {
    try {
        const reason = `Cancelled via ONDC. Reason ID: ${cancellationReasonId}`;
        await wooCommerceAPI.cancelOrder(orderId, reason);

        return {
            context: {
                ...context,
                action: 'on_cancel'
            },
            message: {
                order: {
                    id: orderId,
                    state: 'Cancelled',
                    cancellation_reason_id: cancellationReasonId
                }
            }
        };
    } catch (error) {
        throw new Error(`Cancellation failed: ${error.message}`);
    }
};

module.exports = {
    validateCancellation,
    processCancellation
};