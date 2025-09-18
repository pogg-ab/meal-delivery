# Use official Node.js LTS image
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application
COPY . .

# Build the app
RUN npm run build

# Expose port (if needed for HTTP)
EXPOSE 3000

# Set environment variables (override in production)
ENV NODE_ENV=production

# Start the microservice
CMD ["node", "dist/main.js"] 