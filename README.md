# Auction House — Backend API

Real-time online auction platform built as a technical test for Verzel's Elite Dev Junior Full Stack position.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun 1.x |
| Framework | NestJS 10 |
| Database | PostgreSQL 16 + Prisma 7 |
| Cache / Queue | Redis 7 + BullMQ |
| Auth | Better Auth 1.7 (email + password, argon2) |
| Realtime | Server-Sent Events (SSE) via RxJS |
| Validation | Zod |
| Linting | Biome |
| Testing | Jest 29 (unit + e2e) |
| CI | GitHub Actions |

## Features

- **Authentication** — sign-up / sign-in / sign-out with role-based access (AUCTIONEER / BIDDER)
- **LGPD compliance** — PII encrypted at rest (Fernet/AES-128-CBC + HMAC-SHA256), blind email index, data-export endpoint
- **Lots** — create, list (cursor pagination), cancel with automatic fund release
- **Real-time bidding** — SSE stream per lot, anti-sniping (extends close time by 2 min when bid arrives within 2 min of deadline)
- **Bid chain integrity** — SHA-256 hash chain + HMAC-signed audit log
- **Pseudonyms** — deterministic HMAC-derived bidder aliases (e.g. `SwiftFalcon042`)
- **Wallet** — deposit, commit/release, settlement; full ledger history
- **Settlement** — atomic Prisma transaction: winner debit, auctioneer credit, signed receipt
- **Catalog** — AIC, Scryfall, Open Library integration with snapshot cache
- **Scheduling** — BullMQ workers for SCHEDULED → LIVE → CLOSED transitions
- **Rate limiting** — 10 req/s + 200 req/min global throttle

## Local Setup

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.4
- [Docker](https://docker.com) + Docker Compose

### 1. Start infrastructure

```bash
docker compose up -d postgres redis
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Fill in the generated keys (see Environment Variables below)
```

### 3. Install and migrate

```bash
bun install
bunx prisma migrate deploy
bunx prisma db seed
```

### 4. Run

```bash
bun run start:dev
```

API available at `http://localhost:3000`.

### Demo accounts (seeded)

| Email | Password | Role |
|-------|----------|------|
| `auctioneer@demo.com` | `Password123!` | AUCTIONEER |
| `bidder1@demo.com` | `Password123!` | BIDDER |
| `bidder2@demo.com` | `Password123!` | BIDDER |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection URL |
| `FERNET_KEYS` | Comma-separated base64url 32-byte keys for PII encryption |
| `EMAIL_LOOKUP_KEY` | 32-byte key for HMAC email blind index |
| `PSEUDONYM_KEY` | 32-byte key for deterministic bidder pseudonyms |
| `AUDIT_SIGNING_KEY` | 32-byte key for HMAC bid-chain signatures |
| `BETTER_AUTH_SECRET` | Secret for Better Auth session tokens |
| `BETTER_AUTH_URL` | Public URL of this API |
| `FRONTEND_ORIGIN` | Frontend origin for CORS |

Generate keys:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## API Overview

All routes are prefixed with `/api`.

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/sign-up/email` | Register (body: `email, password, name, role`) |
| POST | `/auth/sign-in/email` | Sign in (body: `email, password`) |
| POST | `/auth/sign-out` | Sign out |
| GET | `/auth/get-session` | Current session |

### Lots

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/lots` | AUCTIONEER | Create lot |
| GET | `/lots` | — | List lots (query: `status, limit, cursor`) |
| GET | `/lots/:id` | — | Get lot detail |
| DELETE | `/lots/:id` | AUCTIONEER | Cancel lot |
| GET | `/lots/:id/position` | BIDDER | My rank and gap to lead |

### Bids

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/lots/:id/bids` | BIDDER | Place bid |
| GET | `/lots/:id/bids` | — | Bid history (with pseudonyms) |
| GET | `/lots/:id/bids/events` | — | SSE live bid stream |
| GET | `/lots/:id/audit` | — | Verify bid chain integrity |

### Wallet

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/wallets/me/balance` | BIDDER | Current balance |
| POST | `/wallets/me/deposit` | BIDDER | Add funds |
| GET | `/wallets/me/ledger` | BIDDER | Transaction history |

### Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users/me/bids` | BIDDER | My bid history |
| GET | `/users/me/wins` | BIDDER | My won auctions |
| GET | `/users/me/export` | Any | LGPD data export |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health/live` | Liveness check |
| GET | `/health/ready` | Readiness check (DB + Redis) |

## Running Tests

```bash
# Unit + e2e (requires test DB + Redis)
bun run test

# Watch mode
bun run test:watch

# Coverage
bun run test:cov
```

## Docker (production)

```bash
# Full stack
docker compose up --build
```

The `docker-compose.yml` starts postgres, redis, and the API with automatic migration on boot.
