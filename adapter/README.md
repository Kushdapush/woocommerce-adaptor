# woocommerce-adaptor

## Docker Deployment

This repository includes Docker configuration for easy deployment.

### Build the image
docker build -t ondc-woocommerce-connector .
Copy
### Run the container
docker run -p 3000:3000 --env-file .env ondc-woocommerce-connector
Copy
Note: Create a .env file with the necessary environment variables before running.