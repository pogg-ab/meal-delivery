# Use official Node.js LTS image
# FROM node:18-alpine

# WORKDIR /usr/src/app

# COPY package*.json ./
# RUN npm install --production

# COPY . .

# RUN npm run build

# EXPOSE 3000

# ENV NODE_ENV=production

# CMD ["node", "dist/main.js"] 

FROM node:20-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package*.json ./
RUN npm install --production --legacy-peer-deps
CMD [ "node", "dist/main.js" ]