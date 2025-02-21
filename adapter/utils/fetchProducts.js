const axios = require("axios");

const fetchProducts = async (url) => {
    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      throw new Error("Error fetching products from WooCommerce");
    }
};

module.exports = {
    fetchProducts,
};