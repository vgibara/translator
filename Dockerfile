FROM node:20-slim AS builder

RUN apt-get update -y && apt-get install -y openssl ca-certificates

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim

RUN apt-get update -y && apt-get install -y openssl ca-certificates

WORKDIR /app

COPY package*.json ./
RUN npm install --production
COPY prisma ./prisma/
RUN npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["sh", "-c", "node dist/scripts/fix-db-permissions.js && npx prisma db push --accept-data-loss && npm start"]
