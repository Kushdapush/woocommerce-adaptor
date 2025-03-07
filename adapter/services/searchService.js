const { makeRequest } = require("../utils/networkHandler");
const { fetchProducts } = require("../utils/fetchProducts");
const catalogModel = require("../models/catalougeModel");
const logger = require("../utils/logger");
const {
  WOO_BASE_URL,
  WOO_CONSUMER_KEY,
  WOO_CONSUMER_SECRET,
} = require("../utils/config");

const searchByCity = async ({ category, city }) => {
  const queryParams = new URLSearchParams({
    consumer_key: WOO_CONSUMER_KEY,
    consumer_secret: WOO_CONSUMER_SECRET,
    city: city,
    category: category?.id || "",
  });
  const url = `${WOO_BASE_URL}/products?${queryParams.toString()}`;
  return fetchProducts(url);
};

const sendOnSearchResponse = async (context, message) => {
  try {
    // Extract BAP URI
    const bapUri = context.bap_uri;
    if (!bapUri) {
      throw new Error("BAP URI not found in context");
    }

    // Process search intent
    const products = await searchByCity({
      category: message.intent?.category || {},
      city: context.city || "default"
    });

    // Map products to ONDC catalog format
    const catalog = catalogModel.mapToONDC(products);

    // on_search response 
    const onSearchResponse = {
      context: {
        domain: context.domain,
        country: context.country,
        city: context.city,
        action: "on_search",
        core_version: context.core_version,
        bap_id: context.bap_id,
        bap_uri: context.bap_uri,
        bpp_id: process.env.BPP_ID || "woocommerce.bpp.example.com",
        bpp_uri: process.env.BPP_URI || "https://woocommerce-adaptor.example.com",
        transaction_id: context.transaction_id,
        message_id: context.message_id,
        timestamp: new Date().toISOString()
      },
      message: {
        catalog: catalog
      }
    };

    // Send on_search response
    const onSearchUrl = `${bapUri}/on_search`;
    logger.info(`Sending on_search response to ${onSearchUrl}`, { 
      transactionId: context.transaction_id 
    });
    
    return await makeRequest(
      'post',
      onSearchUrl, 
      onSearchResponse, 
      {}, 
      context.transaction_id
    );
  } catch (error) {
    logger.error("Error sending on_search response", {
      transactionId: context.transaction_id,
      error: error.message,
      stack: error.stack,
    });

    // Try to send error response if possible
    if (context && context.bap_uri) {
      try {
        const errorResponse = {
          context: {
            domain: context.domain,
            country: context.country,
            city: context.city,
            action: "on_search",
            core_version: context.core_version,
            bap_id: context.bap_id,
            bap_uri: context.bap_uri,
            bpp_id: process.env.BPP_ID || "woocommerce.bpp.example.com",
            bpp_uri: process.env.BPP_URI || "https://woocommerce-adaptor.example.com",
            transaction_id: context.transaction_id,
            message_id: context.message_id,
            timestamp: new Date().toISOString()
          },
          error: {
            type: "DOMAIN-ERROR",
            code: "woocommerce_search_error",
            message: error.message || "Error processing search request"
          }
        };

        const onSearchUrl = `${context.bap_uri}/on_search`;
        await makeRequest('post', onSearchUrl, errorResponse, {}, context.transaction_id);
        logger.info("Error response sent to BAP", { transactionId: context.transaction_id });
      } catch (sendError) {
        logger.error("Failed to send error response", {
          transactionId: context.transaction_id,
          error: sendError.message
        });
      }
    }
    
    throw error;
  }
};

module.exports = {
  searchByCity,
  sendOnSearchResponse
};