# ----- Builder Stage -----
FROM node:20 AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install ALL dependencies, including our new cache-manager
RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build

# ----- Production Stage -----
FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./

# Install ONLY production dependencies
RUN npm install --production --legacy-peer-deps

# Copy the compiled code from the builder stage
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/data-source.js ./data-source.js

CMD ["node", "dist/main"]
