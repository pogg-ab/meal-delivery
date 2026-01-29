# ----- Builder Stage -----
FROM node:20 AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --legacy-peer-deps
RUN chmod +x node_modules/.bin/nest
COPY . .
RUN npm run build

# ----- Production Stage -----
FROM node:20-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --production --legacy-peer-deps
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/data-source.js ./data-source.js

# For notification-service ONLY, also keep the firebase line:
# COPY --from=builder /usr/src/app/firebase-credentials.json ./firebase-credentials.json

CMD ["node", "dist/main"]
