const searchService = require("../services/searchService");
const catalogModel = require("../models/catalougeModel");
const handleError = require("../utils/errorHandler");

const handleSearchRequest = async (req, res) => {
  const { context, message } = req.body;
  const intent = message.intent;
  const city = context.city;

  try {
    if (intent.category?.id && city) {
      const products = await searchService.searchByCity({
        category: intent.category,
        city: city,
      });
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

module.exports = { handleSearchRequest };
