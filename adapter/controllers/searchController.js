const wooCommerceService = require("../services/wooCommerceService");
const catalogModel = require("../models/catalougeModel");
const handleError = require('../utils/errorHandler');

const handleSearchRequest = async (req, res) => {
  const { context, message } = req.body;
  const intent = message.intent;

  try {
    if (intent.category?.id && intent.city) {
      const products = await wooCommerceService.searchByCityAndCategory(intent);
      const catalog = catalogModel.mapToONDC(products);
      return res.status(200).json(createResponse(context, catalog));
    } else {
      throw new Error("Unsupported search type");
    }
  } catch (error) {
    handleError(res, error, "Error processing /search request");
  }
};

const createResponse = (context, catalog) => ({
  context: {
    ...context,
    action: "on_search",
    timestamp: new Date().toISOString(),
  },
  message: { catalog },
});

const createLinkResponse = (context, link) => ({
  context: {
    ...context,
    action: "on_search",
    timestamp: new Date().toISOString(),
  },
  message: {
    catalog: {
      downloadable_link: link,
    },
  },
});

module.exports = { handleSearchRequest };