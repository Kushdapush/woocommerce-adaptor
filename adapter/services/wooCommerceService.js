const axios = require("axios");
const { WOO_BASE_URL, WOO_CONSUMER_KEY, WOO_CONSUMER_SECRET } = require("../utils/config");

const searchByItem = async (intent) => {
  const queryParams = new URLSearchParams({
    consumer_key: WOO_CONSUMER_KEY,
    consumer_secret: WOO_CONSUMER_SECRET,
    search: intent.item.descriptor.name,
  });
  const url = `${WOO_BASE_URL}/products?${queryParams.toString()}`;
  return fetchProducts(url);
};

const searchByCityAndCategory = async (intent) => {
  const queryParams = new URLSearchParams({
    consumer_key: WOO_CONSUMER_KEY,
    consumer_secret: WOO_CONSUMER_SECRET,
    city: intent.city,
    category: intent.category.id,
  });
  const url = `${WOO_BASE_URL}/products?${queryParams.toString()}`;
  return fetchProducts(url);
};

const generateDownloadableCatalog = async (intent) => {
  const catalogUrl = `${WOO_BASE_URL}/download/catalog.zip`;
  return catalogUrl;
};

const fetchProducts = async (url) => {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    throw new Error("Error fetching products from WooCommerce");
  }
};

module.exports = {
  searchByItem,
  searchByCityAndCategory,
  generateDownloadableCatalog,
};
