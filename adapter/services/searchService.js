const { fetchProducts } = require("../utils/fetchProducts");
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

module.exports = {
  searchByCity,
};
