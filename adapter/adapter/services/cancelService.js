const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');
const wooCommerceAPI = require('../utils/wooCommerceAPI');
const callbackHandler = require('../utils/callbackHandler');
const rtoHandler = require('../utils/rtoHandler');

/**
 * Validate cancellation request
 * @param {string} orderId - ONDC order ID
 * @param {string} cancellationReasonId - Cancellation reason code
 * @param {string} fulfillmentId - Fulfillment ID to cancel
 * @param {Object} context - ONDC context
 * @returns {Promise<Object>} Validation result
 */
const validateCancellation = async (orderId, cancellationReasonId, fulfillmentId, context) => {
  try {
    // First, find the order
    const orders = await wooCommerceAPI.getOrders({
      meta_key: 'ondc_order_id',
      meta_value: orderId
    });
    
    if (!orders || orders.length === 0) {
      return {
        valid: false,
        reason: `Order ${orderId} not found`,
        errorCode: '30011'
      };
    }
    
    const order = orders[0];
    
    // Check if cancellation reason is valid
    const validReasons = ['001', '002', '003', '004', '005', '006', '007', '008', '009'];
    if (!validReasons.includes(cancellationReasonId)) {
      return {
        valid: false,
        reason: `Invalid cancellation reason: ${cancellationReasonId}`,
        errorCode: '30012'
      };
    }
    
    // For TAT breach reason (006), verify if there's an actual breach
    if (cancellationReasonId === '006') {
      const tatBreached = await checkTATBreach(order, fulfillmentId);
      if (!tatBreached) {
        return {
          valid: false,
          reason: 'No TAT breach found for fulfillment',
          errorCode: '30014'
        };
      }
    }
    
    // Check if order is in a cancellable state
    const orderStatus = order.status;
    const cancellableStates = ['pending', 'processing', 'on-hold'];
    
    if (!cancellableStates.includes(orderStatus)) {
      return {
        valid: false,
        reason: `Order in non-cancellable state: ${orderStatus}`,
        errorCode: '30013'
      };
    }
    
    // Check force parameter (if provided)
    const forceCancel = getForceParameter(context);
    if (forceCancel) {
      // Force cancellation has different validation rules
      // We'll skip some checks for force cancellation
      logger.info('Force cancellation requested', {
        transactionId: context.transaction_id,
        orderId
      });
    }
    
    // All validations passed
    return {
      valid: true,
      order
    };
  } catch (error) {
    logger.error('Error validating cancellation', {
      error: error.message,
      orderId,
      cancellationReasonId
    });
    
    return {
      valid: false,
      reason: `Error during validation: ${error.message}`,
      errorCode: '30000'
    };
  }
};

/**
 * Check if TAT (Turn-Around-Time) has been breached
 * @param {Object} order - WooCommerce order
 * @param {string} fulfillmentId - Fulfillment ID
 * @returns {Promise<boolean>} Whether TAT was breached
 */
const checkTATBreach = async (order, fulfillmentId) => {
  try {
    // Get the fulfillment's TAT metadata
    const tatMeta = order.meta_data.find(meta => 
      meta.key === `ondc_fulfillment_${fulfillmentId}_tat`
    );
    
    if (!tatMeta) {
      logger.warn('No TAT info found for fulfillment', {
        orderId: order.id,
        fulfillmentId
      });
      return false;
    }
    
    // Parse TAT duration (e.g., "PT60M" means 60 minutes)
    const tatDuration = parseTAT(tatMeta.value);
    if (!tatDuration) {
      return false;
    }
    
    // Get the fulfillment start time
    const startTimeMeta = order.meta_data.find(meta => 
      meta.key === `ondc_fulfillment_${fulfillmentId}_start_time`
    );
    
    if (!startTimeMeta) {
      return false;
    }
    
    // Calculate expected completion time
    const startTime = new Date(startTimeMeta.value);
    const expectedCompletionTime = new Date(startTime.getTime() + tatDuration);
    
    // Check if current time exceeds expected completion time
    const currentTime = new Date();
    return currentTime > expectedCompletionTime;
  } catch (error) {
    logger.error('Error checking TAT breach', {
      error: error.message,
      orderId: order.id,
      fulfillmentId
    });
    return false;
  }
};

/**
 * Parse TAT string (ISO 8601 duration) to milliseconds
 * @param {string} tatString - TAT duration string (e.g., "PT60M")
 * @returns {number|null} Duration in milliseconds or null if invalid
 */
const parseTAT = (tatString) => {
  try {
    // Simple parser for ISO 8601 duration format
    // This is a simplified version - a full library might be better for production
    if (tatString.startsWith('PT')) {
      // Remove the PT prefix
      const duration = tatString.substring(2);
      
      let totalMilliseconds = 0;
      
      // Hours
      const hoursMatch = duration.match(/(\d+)H/);
      if (hoursMatch) {
        totalMilliseconds += parseInt(hoursMatch[1]) * 60 * 60 * 1000;
      }
      
      // Minutes
      const minutesMatch = duration.match(/(\d+)M/);
      if (minutesMatch) {
        totalMilliseconds += parseInt(minutesMatch[1]) * 60 * 1000;
      }
      
      // Seconds
      const secondsMatch = duration.match(/(\d+)S/);
      if (secondsMatch) {
        totalMilliseconds += parseInt(secondsMatch[1]) * 1000;
      }
      
      return totalMilliseconds;
    }
    
    // Handle days (P1D format)
    if (tatString.startsWith('P') && tatString.endsWith('D')) {
      const days = parseInt(tatString.substring(1, tatString.length - 1));
      return days * 24 * 60 * 60 * 1000;
    }
    
    return null;
  } catch (error) {
    logger.error('Error parsing TAT', { error: error.message, tatString });
    return null;
  }
};

/**
 * Extract force parameter from the request
 * @param {Object} context - ONDC context
 * @returns {boolean} Whether force cancellation is requested
 */
const getForceParameter = (request) => {
  try {
    const forceTag = request.message?.descriptor?.tags?.find(tag => 
      tag.code === 'params' && 
      tag.list?.some(item => item.code === 'force')
    );
    
    if (forceTag) {
      const forceItem = forceTag.list.find(item => item.code === 'force');
      return forceItem.value.toLowerCase() === 'yes';
    }
    
    return false;
  } catch (error) {
    return false;
  }
};

/**
 * Process cancellation for an order
 * @param {string} orderId - ONDC order ID
 * @param {string} cancellationReasonId - Cancellation reason code
 * @param {string} fulfillmentId - Fulfillment ID to cancel
 * @param {Object} context - ONDC context
 * @returns {Promise<Object>} ONDC on_cancel response
 */
const processCancellation = async (orderId, cancellationReasonId, fulfillmentId, context) => {
  try {
    // Find the order again (validation already ran)
    const orders = await wooCommerceAPI.getOrders({
      meta_key: 'ondc_order_id',
      meta_value: orderId
    });
    
    if (!orders || orders.length === 0) {
      throw new ApiError(`Order ${orderId} not found`, 404);
    }
    
    const order = orders[0];
    
    // Determine if it's a fulfillment cancellation or order cancellation
    const isFulfillmentCancellation = fulfillmentId !== orderId;
    
    // Update order status and metadata
    let updatedOrder;
    
    if (isFulfillmentCancellation) {
      // Cancel specific fulfillment but not the whole order
      updatedOrder = await cancelFulfillment(
        order, 
        fulfillmentId, 
        cancellationReasonId, 
        context.bap_id
      );
    } else {
      // Cancel entire order
      updatedOrder = await cancelOrder(
        order, 
        cancellationReasonId, 
        context.bap_id
      );
    }
    
    // Calculate refund amount if applicable
    const refundAmount = await calculateRefundAmount(
      order, 
      cancellationReasonId, 
      isFulfillmentCancellation ? fulfillmentId : null
    );
    
    // Process refund if needed
    if (refundAmount > 0) {
      await processRefund(order.id, refundAmount, cancellationReasonId, context);
    }
    
    // Generate on_cancel response
    return generateOnCancelResponse(updatedOrder, cancellationReasonId, context);
  } catch (error) {
    logger.error('Error processing cancellation', {
      error: error.message,
      orderId,
      cancellationReasonId,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Cancel specific fulfillment
 * @param {Object} order - WooCommerce order
 * @param {string} fulfillmentId - Fulfillment ID to cancel
 * @param {string} reasonId - Cancellation reason code
 * @param {string} cancelledBy - Who initiated the cancellation
 * @returns {Promise<Object>} Updated WooCommerce order
 */
const cancelFulfillment = async (order, fulfillmentId, reasonId, cancelledBy) => {
  try {
    // Update fulfillment status in metadata
    const meta_data = [
      { 
        key: `ondc_fulfillment_${fulfillmentId}_state`, 
        value: 'Cancelled' 
      },
      { 
        key: `ondc_fulfillment_${fulfillmentId}_cancellation_reason`, 
        value: reasonId 
      },
      { 
        key: `ondc_fulfillment_${fulfillmentId}_cancelled_by`, 
        value: cancelledBy 
      },
      { 
        key: `ondc_fulfillment_${fulfillmentId}_cancellation_time`, 
        value: new Date().toISOString() 
      }
    ];
    
    // Update the order with new metadata
    return await wooCommerceAPI.updateOrder(order.id, { meta_data });
  } catch (error) {
    logger.error('Error cancelling fulfillment', {
      error: error.message,
      orderId: order.id,
      fulfillmentId
    });
    throw error;
  }
};

/**
 * Cancel entire order
 * @param {Object} order - WooCommerce order
 * @param {string} reasonId - Cancellation reason code
 * @param {string} cancelledBy - Who initiated the cancellation
 * @returns {Promise<Object>} Updated WooCommerce order
 */
const cancelOrder = async (order, reasonId, cancelledBy) => {
  try {
    // Update order status to cancelled
    const updatedOrder = await wooCommerceAPI.updateOrder(order.id, {
      status: 'cancelled',
      meta_data: [
        { key: 'ondc_order_state', value: 'Cancelled' },
        { key: 'ondc_cancellation_reason', value: reasonId },
        { key: 'ondc_cancelled_by', value: cancelledBy },
        { key: 'ondc_cancellation_time', value: new Date().toISOString() }
      ]
    });
    
    logger.info('Order cancelled successfully', {
      orderId: order.id,
      ondcOrderId: getOndcOrderId(order),
      reasonId
    });
    
    return updatedOrder;
  } catch (error) {
    logger.error('Error cancelling order', {
      error: error.message,
      orderId: order.id
    });
    throw error;
  }
};

/**
 * Calculate refund amount based on cancellation policy
 * @param {Object} order - WooCommerce order
 * @param {string} reasonId - Cancellation reason code
 * @param {string|null} fulfillmentId - Fulfillment ID or null for whole order
 * @returns {Promise<number>} Refund amount
 */
const calculateRefundAmount = async (order, reasonId, fulfillmentId) => {
  try {
    const orderTotal = parseFloat(order.total);
    
    // Get cancellation fee based on order state and reason
    const cancellationFee = await getCancellationFee(order, reasonId);
    
    // For fulfillment cancellation, only refund relevant portion
    if (fulfillmentId) {
      // Get items associated with this fulfillment
      const fulfillmentItems = order.line_items.filter(item => {
        const itemFulfillmentMeta = item.meta_data.find(meta => 
          meta.key === 'ondc_fulfillment_id'
        );
        
        return itemFulfillmentMeta && itemFulfillmentMeta.value === fulfillmentId;
      });
      
      if (fulfillmentItems.length === 0) {
        return 0; // No items to refund
      }
      
      // Calculate total for these items
      const itemsTotal = fulfillmentItems.reduce((sum, item) => 
        sum + parseFloat(item.total) + parseFloat(item.total_tax), 0
      );
      
      // Apply cancellation fee proportionally
      return Math.max(0, itemsTotal - cancellationFee);
    }
    
    // For full order cancellation
    return Math.max(0, orderTotal - cancellationFee);
  } catch (error) {
    logger.error('Error calculating refund amount', {
      error: error.message,
      orderId: order.id
    });
    return 0; // Default to no refund in case of error
  }
};

/**
 * Get cancellation fee based on order state and reason
 * @param {Object} order - WooCommerce order
 * @param {string} reasonId - Cancellation reason code
 * @returns {Promise<number>} Cancellation fee amount
 */
const getCancellationFee = async (order, reasonId) => {
  // Get current fulfillment state
  const fulfillmentStateMeta = order.meta_data.find(meta => 
    meta.key === 'ondc_fulfillment_state'
  );
  
  const fulfillmentState = fulfillmentStateMeta?.value || 'Pending';
  const orderTotal = parseFloat(order.total);
  
  // Define cancellation fee structure based on fulfillment state
  // These percentages should be stored in configuration
  const cancellationFees = {
    'Pending': 0, // 0% of order total
    'Packed': 0.1, // 10% of order total
    'Order-picked-up': 0.1, // 10% of order total
    'Out-for-delivery': 0.2 // 20% of order total
  };
  
  // For customer-initiated cancellation due to TAT breach, there should be no fee
  if (reasonId === '006') {
    return 0;
  }
  
  // Get fee percentage based on current state
  const feePercentage = cancellationFees[fulfillmentState] || 0;
  
  // Calculate fee
  return orderTotal * feePercentage;
};
/**
 * Process refund for an order
 * @param {number} orderId - WooCommerce order ID
 * @param {number} amount - Refund amount
 * @param {string} reasonId - Cancellation reason code
 * @param {Object} context - ONDC context
 * @returns {Promise<Object>} Refund result
 */
const processRefund = async (orderId, amount, reasonId, context) => {
    try {
      // Convert reason ID to readable reason
      const reasonMap = {
        '001': 'Order delivery delayed',
        '002': 'Order quantity not available',
        '003': 'Payment issues',
        '004': 'Price issues',
        '005': 'Product or service inadequate',
        '006': 'TAT breach',
        '007': 'Address issues',
        '008': 'Buyer cancelled',
        '009': 'Seller rejected',
        // RTO reasons
        '010': 'Buyer not available',
        '011': 'Buyer refused to accept',
        '012': 'Buyer address not reachable',
        '013': 'Delivery reattmpt failed'
      };
      
      const reason = reasonMap[reasonId] || `Cancellation reason ${reasonId}`;
      
      // Create refund in WooCommerce
      const refund = await wooCommerceAPI.post(`orders/${orderId}/refunds`, {
        amount: amount.toFixed(2),
        reason,
        refund_payment: true, // Attempt to refund through payment gateway
        api_refund: true
      });
      
      logger.info('Refund processed successfully', {
        orderId,
        refundId: refund.data.id,
        amount: refund.data.amount,
        transactionId: context.transaction_id
      });
      
      return refund.data;
    } catch (error) {
      logger.error('Error processing refund', {
        error: error.message,
        orderId,
        amount,
        transactionId: context.transaction_id
      });
      
      // Continue without refund - may need manual processing
      return null;
    }
  };
  
  /**
   * Generate ONDC on_cancel response
   * @param {Object} order - WooCommerce order
   * @param {string} reasonId - Cancellation reason code
   * @param {Object} context - ONDC context
   * @returns {Promise<Object>} ONDC on_cancel response
   */
  const generateOnCancelResponse = async (order, reasonId, context) => {
    try {
      // Extract necessary data from order
      const ondcOrderId = getOndcOrderId(order);
      const cancelledBy = order.meta_data.find(meta => meta.key === 'ondc_cancelled_by')?.value || context.bap_id;
      
      // Build items array - set cancelled items to quantity 0
      const items = buildCancelledItemsArray(order);
      
      // Build fulfillments array
      const fulfillments = buildCancelledFulfillmentsArray(order);
      
      // Build updated quote with cancellation charges
      const quote = buildUpdatedQuote(order);
      
      // Check if this is an RTO cancellation
      const isRTO = isRTOCancellation(order, reasonId);
      
      // If RTO, add special RTO fulfillment
      if (isRTO) {
        const rtoFulfillment = await rtoHandler.createRTOFulfillment(order);
        if (rtoFulfillment) {
          fulfillments.push(rtoFulfillment);
        }
      }
      
      // Build complete response
      return {
        context: {
          ...context,
          action: 'on_cancel',
          timestamp: new Date().toISOString(),
          message_id: `ondc-message-${order.id}-cancel`,
          bpp_id: context.bpp_id,
          bpp_uri: context.bpp_uri
        },
        message: {
          order: {
            id: ondcOrderId,
            state: 'Cancelled',
            provider: buildProvider(order),
            items: items,
            billing: buildBilling(order),
            fulfillments: fulfillments,
            quote: quote,
            cancellation: {
              cancelled_by: cancelledBy,
              reason: {
                id: reasonId
              }
            },
            payment: buildPayment(order),
            created_at: order.date_created,
            updated_at: new Date().toISOString()
          }
        }
      };
    } catch (error) {
      logger.error('Error generating on_cancel response', {
        error: error.message,
        orderId: order.id,
        stack: error.stack
      });
      throw error;
    }
  };
  
  /**
   * Check if cancellation is an RTO (Return to Origin)
   * @param {Object} order - WooCommerce order
   * @param {string} reasonId - Cancellation reason code
   * @returns {boolean} Whether this is an RTO cancellation
   */
  const isRTOCancellation = (order, reasonId) => {
    // RTO reason codes (as per ONDC specification)
    const rtoReasonCodes = ['010', '011', '012', '013'];
    return rtoReasonCodes.includes(reasonId);
  };
  
  /**
   * Build items array for cancelled order
   * @param {Object} order - WooCommerce order
   * @returns {Array} Array of items with cancelled items set to quantity 0
   */
  const buildCancelledItemsArray = (order) => {
    return order.line_items.map(item => {
      // Extract ONDC item ID from metadata
      const ondcItemId = item.meta_data.find(meta => meta.key === 'ondc_item_id')?.value || `I${item.product_id}`;
      
      // Extract fulfillment ID from metadata
      const fulfillmentId = item.meta_data.find(meta => meta.key === 'ondc_fulfillment_id')?.value || 'F1';
      
      // For cancelled items, set quantity to 0
      return {
        id: ondcItemId,
        fulfillment_id: fulfillmentId,
        quantity: {
          count: 0
        }
      };
    });
  };
  
  /**
   * Build fulfillments array for cancelled order
   * @param {Object} order - WooCommerce order
   * @returns {Array} Fulfillments array with cancelled state
   */
  const buildCancelledFulfillmentsArray = (order) => {
    // Collect all fulfillment IDs from order metadata
    const fulfillmentIds = new Set();
    
    // Look through all line items to find fulfillment IDs
    order.line_items.forEach(item => {
      const fulfillmentMeta = item.meta_data.find(meta => meta.key === 'ondc_fulfillment_id');
      if (fulfillmentMeta && fulfillmentMeta.value) {
        fulfillmentIds.add(fulfillmentMeta.value);
      }
    });
    
    // If no fulfillment IDs found, use a default
    if (fulfillmentIds.size === 0) {
      fulfillmentIds.add('F1');
    }
    
    // Build fulfillment objects
    return Array.from(fulfillmentIds).map(id => {
      // Get fulfillment state
      const state = order.meta_data.find(meta => meta.key === `ondc_fulfillment_${id}_state`)?.value || 'Cancelled';
      
      // Get fulfillment provider name
      const providerName = order.meta_data.find(meta => meta.key === `ondc_fulfillment_${id}_provider_name`)?.value || 'Provider';
      
      return {
        id: id,
        '@ondc/org/provider_name': providerName,
        type: 'Delivery',
        state: {
          descriptor: {
            code: state
          }
        },
        tracking: true,
        // Include tags with cancellation details
        tags: [
          {
            code: 'cancel_request',
            list: [
              {
                code: 'reason_id',
                value: order.meta_data.find(meta => meta.key === 'ondc_cancellation_reason')?.value || '008'
              },
              {
                code: 'initiated_by',
                value: order.meta_data.find(meta => meta.key === 'ondc_cancelled_by')?.value || 'unknown'
              }
            ]
          }
        ]
      };
    });
  };
  
  /**
   * Build updated quote with cancellation charges
   * @param {Object} order - WooCommerce order
   * @returns {Object} Updated quote object
   */
  const buildUpdatedQuote = (order) => {
    // Get cancellation fee from metadata
    const cancellationFeeMeta = order.meta_data.find(meta => meta.key === 'ondc_cancellation_fee');
    const cancellationFee = cancellationFeeMeta ? parseFloat(cancellationFeeMeta.value) : 0;
    
    // Calculate refunded amount
    const orderTotal = parseFloat(order.total);
    const refundedAmount = orderTotal - cancellationFee;
    
    // Build quote breakup
    const breakup = [];
    
    // Add item entries with 0 value
    order.line_items.forEach(item => {
      const ondcItemId = item.meta_data.find(meta => meta.key === 'ondc_item_id')?.value || `I${item.product_id}`;
      
      breakup.push({
        '@ondc/org/item_id': ondcItemId,
        '@ondc/org/item_quantity': {
          count: 0
        },
        title: item.name,
        '@ondc/org/title_type': 'item',
        price: {
          currency: 'INR',
          value: '0.00'
        },
        item: {
          price: {
            currency: 'INR',
            value: item.price
          }
        }
      });
    });
    
    // Add other charges that still apply
    
    // Delivery charges if still applicable (often still charged on cancellation)
    const fulfillmentId = 'F1'; // Default fulfillment ID if none found
    breakup.push({
      '@ondc/org/item_id': fulfillmentId,
      title: 'Delivery charges',
      '@ondc/org/title_type': 'delivery',
      price: {
        currency: 'INR',
        value: order.shipping_total || '0.00'
      }
    });
    
    // Cancellation fee if applicable
    if (cancellationFee > 0) {
      breakup.push({
        '@ondc/org/item_id': fulfillmentId,
        title: 'Cancellation Fee',
        '@ondc/org/title_type': 'cancellation',
        price: {
          currency: 'INR',
          value: cancellationFee.toFixed(2)
        }
      });
    }
    
    return {
      price: {
        currency: 'INR',
        value: cancellationFee.toFixed(2) // Only the cancellation fee is charged
      },
      breakup
    };
  };
  
  /**
   * Get ONDC order ID from WooCommerce metadata
   * @param {Object} order - WooCommerce order
   * @returns {string} ONDC order ID
   */
  const getOndcOrderId = (order) => {
    const ondcOrderIdMeta = order.meta_data.find(meta => meta.key === 'ondc_order_id');
    return ondcOrderIdMeta ? ondcOrderIdMeta.value : `O${order.id}`;
  };
  
  /**
   * Build provider object for ONDC response
   * @param {Object} order - WooCommerce order
   * @returns {Object} Provider object
   */
  const buildProvider = (order) => {
    const providerId = order.meta_data.find(meta => meta.key === 'ondc_provider_id')?.value || 'P1';
    
    return {
      id: providerId,
      locations: [
        {
          id: 'L1'
        }
      ]
    };
  };
  
  /**
   * Build billing object for ONDC response
   * @param {Object} order - WooCommerce order
   * @returns {Object} Billing object
   */
  const buildBilling = (order) => {
    return {
      name: `${order.billing.first_name} ${order.billing.last_name}`.trim(),
      address: {
        name: order.billing.address_1.split(',')[0] || '',
        building: order.billing.address_1,
        locality: order.billing.address_2 || '',
        city: order.billing.city,
        state: order.billing.state,
        country: order.billing.country,
        area_code: order.billing.postcode
      },
      email: order.billing.email,
      phone: order.billing.phone,
      created_at: order.date_created,
      updated_at: order.date_modified || order.date_created
    };
  };
  
  /**
   * Build payment object for ONDC response
   * @param {Object} order - WooCommerce order
   * @returns {Object} Payment object
   */
  const buildPayment = (order) => {
    // Extract payment status from metadata or derive from order status
    const paymentStatus = order.meta_data.find(meta => meta.key === 'ondc_payment_status')?.value || 
      (order.status === 'cancelled' ? 'REFUNDED' : 'PAID');
    
    // Extract payment type from metadata or use default
    const paymentType = order.meta_data.find(meta => meta.key === 'ondc_payment_type')?.value || 'ON-ORDER';
    
    // Extract collected by from metadata or use default
    const collectedBy = order.meta_data.find(meta => meta.key === 'ondc_payment_collected_by')?.value || 'BAP';
    
    return {
      uri: 'https://ondc.transaction.com/payment',
      tl_method: 'http/get',
      params: {
        currency: 'INR',
        transaction_id: String(order.id),
        amount: order.total
      },
      status: paymentStatus,
      type: paymentType,
      collected_by: collectedBy,
      '@ondc/org/buyer_app_finder_fee_type': 'percent',
      '@ondc/org/buyer_app_finder_fee_amount': '3'
    };
  };
  
  /**
   * Send on_cancel callback to BAP
   * @param {Object} ondcResponse - ONDC on_cancel response
   * @returns {Promise<boolean>} Success status
   */
  const sendOnCancelCallback = async (ondcResponse) => {
    const { context } = ondcResponse;
    const transactionId = context.transaction_id;
    const orderId = ondcResponse.message.order.id;
    
    try {
      logger.info('Sending on_cancel callback to BAP', {
        transactionId,
        orderId,
        bapUri: context.bap_uri
      });
      
      // Use the callback handler to send and manage retries
      const result = await callbackHandler.sendCallback(
        `${context.bap_uri}/on_cancel`,
        ondcResponse,
        transactionId,
        'on_cancel'
      );
      
      return result.success;
    } catch (error) {
      logger.error('Error sending on_cancel callback', {
        transactionId,
        orderId,
        error: error.message
      });
      
      return false;
    }
  };
  
  module.exports = {
    validateCancellation,
    processCancellation,
    sendOnCancelCallback,
    generateOnCancelResponse
  };