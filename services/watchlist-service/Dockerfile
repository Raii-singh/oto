FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3003/health || exit 1
CMD ["node", "dist/index.js"]
