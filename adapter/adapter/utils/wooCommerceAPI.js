const axios = require("axios");

const wooCommerceAPI = axios.create({
  baseURL: process.env.WOO_BASE_URL,
  auth: {
    username: process.env.WOO_CONSUMER_KEY,
    password: process.env.WOO_CONSUMER_SECRET,
  },
});

module.exports = wooCommerceAPI;
