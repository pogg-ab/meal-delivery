# ---- Stage 1: Build ----
FROM node:20-alpine AS builder
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# ---- Stage 2: Production ----
FROM node:20-alpine
WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package*.json ./

# --- THIS IS THE FIX ---
# Copy the data-source file needed for migrations and seeders
COPY --from=builder /usr/src/app/data-source.js ./data-source.js

RUN npm install --production --legacy-peer-deps

CMD ["node", "dist/main"]