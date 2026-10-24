# Stage 1: Install dependencies
FROM oven/bun:1.4.0-alpine AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Stage 2: Build
FROM oven/bun:1.4.0-alpine AS builder
WORKDIR /app
COPY package.json bun.lock* tsconfig.json nest-cli.json ./
RUN bun install --frozen-lockfile
COPY src ./src
COPY prisma ./prisma
RUN bunx prisma generate
RUN bunx nest build

# Stage 3: Production runtime
FROM oven/bun:1.4.0-alpine AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# Storage volume for item images
RUN mkdir -p /app/storage && chown nestjs:nodejs /app/storage
VOLUME ["/app/storage"]

USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health/live || exit 1

ENTRYPOINT ["sh", "-c", "bunx prisma migrate deploy && bun run start:prod"]
