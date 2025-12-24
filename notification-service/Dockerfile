# ----- Builder Stage -----
FROM node:20 AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# ----- Production Stage -----
FROM node:20-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --production --legacy-peer-deps
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/data-source.js ./data-source.js
# We must remember to copy the firebase credentials here!
COPY --from=builder /usr/src/app/firebase-credentials.json ./firebase-credentials.json
CMD ["node", "dist/main"]
