FROM oven/bun:1.4-slim AS builder

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bunx prisma generate
RUN bun run build
RUN bun build prisma/seed.ts --outfile dist/seed.js --target node --external @prisma/client

FROM node:22-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/package.json ./

EXPOSE 3000

CMD ["sh", "-c", "node node_modules/.bin/prisma migrate deploy && node dist/seed.js && node dist/main.js"]
