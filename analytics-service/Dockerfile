# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application
COPY . .

# Build the app
RUN npm run build

# Expose HTTP port
EXPOSE 3006

# Set environment variables (override in production)
ENV NODE_ENV=production

# Start the hybrid app (HTTP + Kafka)
CMD ["node", "dist/main.js"]


