const logger = require('../utils/logger');
const config = require('../utils/config');
const axios = require('axios');

/**
 * Middleware to calculate delivery and packing charges
 */
const chargesMiddleware = {
  /**
   * Calculate delivery charges based on distance, weight, and other parameters
   * 
   * @param {Object} fulfillment - Fulfillment information
   * @param {Array} items - Order items
   * @param {Object} context - Request context
   * @returns {Object} - Delivery charge details
   */
  calculateDeliveryCharges: async (fulfillment, items, context) => {
    logger.info(`Calculating delivery charges for transaction ${context.transaction_id}`);

    try {
      // Extract location information
      const deliveryLocation = fulfillment.end?.location;
      const pickupLocation = fulfillment.start?.location;
      
      if (!deliveryLocation || !pickupLocation) {
        logger.warn('Missing location information for delivery charge calculation');
        return {
          value: config.DEFAULT_DELIVERY_CHARGE.toString(),
          currency: "INR"
        };
      }

      // Calculate estimated weight of the order
      const totalWeight = items.reduce((sum, item) => {
        // In a real implementation, get weight from product details
        const itemWeight = 0.5; // Default weight in kg
        return sum + (itemWeight * (item.quantity?.count || 1));
      }, 0);

      // For a real implementation, you might call a logistics API here
      // Example:
      /*
      const logisticsResponse = await axios.post(config.LOGISTICS_API_URL, {
        pickup: pickupLocation,
        dropoff: deliveryLocation,
        weight: totalWeight,
        dimensions: { length: 10, width: 10, height: 10 }, // Default dimensions
        type: fulfillment.type
      });
      
      return {
        value: logisticsResponse.data.charge.toString(),
        currency: "INR"
      };
      */

      // For now, calculate a mock delivery charge based on a base fee plus weight
      const baseFee = 30;
      const perKgCharge = 10;
      const deliveryCharge = Math.round(baseFee + (totalWeight * perKgCharge));

      return {
        value: deliveryCharge.toString(),
        currency: "INR"
      };
    } catch (error) {
      logger.error(`Error calculating delivery charges: ${error.message}`, {
        transactionId: context.transaction_id,
        error: error.stack
      });
      
      // Return default charge in case of error
      return {
        value: config.DEFAULT_DELIVERY_CHARGE.toString(),
        currency: "INR"
      };
    }
  },

  /**
   * Calculate packing charges based on item type, quantity, etc.
   * 
   * @param {Array} items - Order items
   * @param {Object} context - Request context
   * @returns {Object} - Packing charge details
   */
  calculatePackingCharges: async (items, context) => {
    logger.info(`Calculating packing charges for transaction ${context.transaction_id}`);

    try {
      // For a real implementation, you might determine packing charges based on:
      // 1. Number of items
      // 2. Item categories (some may need special packaging)
      // 3. Fragility
      // 4. Special handling requirements
      
      // Simple calculation based on number of items and a base fee
      const itemCount = items.reduce((count, item) => count + (item.quantity?.count || 1), 0);
      const baseFee = 10;
      const perItemFee = 5;
      
      const packingCharge = Math.round(baseFee + (itemCount * perItemFee));
      
      // Cap the packing charge at a reasonable maximum
      const maxPackingCharge = 50;
      const finalPackingCharge = Math.min(packingCharge, maxPackingCharge);

      return {
        value: finalPackingCharge.toString(),
        currency: "INR"
      };
    } catch (error) {
      logger.error(`Error calculating packing charges: ${error.message}`, {
        transactionId: context.transaction_id,
        error: error.stack
      });
      
      // Return default charge in case of error
      return {
        value: config.DEFAULT_PACKING_CHARGE.toString(),
        currency: "INR"
      };
    }
  }
};

module.exports = chargesMiddleware;