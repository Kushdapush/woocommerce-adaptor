const mapToONDC = (products) => ({
  bpp: {
    providers: [
      {
        id: "WooCommerce_Store",
        descriptor: { name: "WooCommerce Store" },
        items: products.map((product) => ({
          id: product.id,
          descriptor: { name: product.name },
          price: {
            currency: "INR",
            value: product.price,
          },
          quantity: {
            available: { count: product.stock_quantity || 0 },
          },
        })),
      },
    ],
  },
});

module.exports = {
  mapToONDC,
};
