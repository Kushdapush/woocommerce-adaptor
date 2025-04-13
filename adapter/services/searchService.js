const { makeRequest } = require("../utils/networkHandler");
const { fetchProducts } = require("../utils/fetchProducts");
const catalogModel = require("../models/catalougeModel");
const logger = require("../utils/logger");
const fs = require('fs').promises;
const path = require('path');
const {
  WOO_BASE_URL,
  WOO_CONSUMER_KEY,
  WOO_CONSUMER_SECRET,
} = require("../utils/config");

const searchByCity = async ({ category, city }) => {
  try {
    // Read the sample data file instead of calling WooCommerce API
    logger.info(`Fetching products from sample data for city: ${city}, category: ${category?.id || 'all'}`);
    
    const filePath = path.join(__dirname, '../Data/search.json');
    const rawData = await fs.readFile(filePath, 'utf8');
    const products = JSON.parse(rawData);
    
    logger.debug(`Retrieved ${products.length || 0} products from sample data`);
    return products;
  } catch (error) {
    logger.error(`Failed to fetch products from sample data: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
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

    // Send on_search response - Log to console in development mode
    const onSearchUrl = `${bapUri}/on_search`;
    
    console.log("\n===== ON_SEARCH RESPONSE START =====");
    console.log(JSON.stringify(onSearchResponse, null, 2));
    console.log("===== ON_SEARCH RESPONSE END =====\n");
    
    logger.info(`Generated on_search response (not sent to BAP)`, { 
      transactionId: context.transaction_id 
    });
    
    // PRODUCTION MODE (Commented out):
    // return await makeRequest(
    //   'post',
    //   onSearchUrl, 
    //   onSearchResponse, 
    //   {}, 
    //   context.transaction_id
    // );
    
    return onSearchResponse;
  } catch (error) {
    logger.error("Error sending on_search response", {
      transactionId: context.transaction_id,
      error: error.message,
      stack: error.stack,
    });

    throw error;
  }
};

module.exports = {
  searchByCity,
  sendOnSearchResponse
};