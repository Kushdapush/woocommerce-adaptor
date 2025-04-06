const axios = require("axios");
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
    category: category.id,
  });
  const url = `${WOO_BASE_URL}/products?${queryParams.toString()}`;
  return fetchProducts(url);
};

const searchByItem = async (searchString, providerId) => {
  const queryParams = new URLSearchParams({
    consumer_key: WOO_CONSUMER_KEY,
    consumer_secret: WOO_CONSUMER_SECRET,
    search: searchString,
  });
  
  // Add provider filter if provided
  if (providerId) {
    queryParams.append('provider', providerId);
  }
  
  const url = `${WOO_BASE_URL}/products?${queryParams.toString()}`;
  return fetchProducts(url);
};

const generateDownloadableCatalog = async () => {
  // Simple implementation to generate a downloadable catalog
  const queryParams = new URLSearchParams({
    consumer_key: WOO_CONSUMER_KEY,
    consumer_secret: WOO_CONSUMER_SECRET,
    per_page: 100, // Get a large number of products
  });
  
  const url = `${WOO_BASE_URL}/products?${queryParams.toString()}`;
  const products = await fetchProducts(url);
  
  return {
    catalogId: `catalog-${Date.now()}`,
    products: products,
    timestamp: new Date().toISOString()
  };
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
  searchByCity,
  generateDownloadableCatalog,
};
