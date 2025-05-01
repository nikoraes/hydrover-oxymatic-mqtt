FROM node:18-alpine

WORKDIR /app

COPY pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm fetch

COPY . .
RUN pnpm install --offline && pnpm build

CMD ["node", "dist/index.js"]