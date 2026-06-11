# Subfrost.io

Subfrost is a Next.js 16 application for Bitcoin/frBTC metrics, history, and live conference streaming, backed by Prisma/PostgreSQL, Redis caching, and an auxiliary media ingest server.

## Tech Stack

- **Frontend/App:** Next.js 16 (App Router), React 19, TypeScript
- **Styling/UI:** Tailwind CSS, Radix UI, Framer Motion
- **Data layer:** Prisma + PostgreSQL
- **Caching/locks:** Redis with in-memory fallback cache
- **Blockchain access:** `@alkanes/ts-sdk`, `viem`, `bitcoinjs-lib`
- **Charts/visualization:** Recharts, lightweight-charts
- **Testing:** Vitest 4, happy-dom, Testing Library
- **Deployment:** Docker, Cloud Run (see `gcp/` scripts)

## Repository Layout

```text
app/                # Next.js routes and API endpoints
components/         # Reusable React UI components
lib/                # Data clients, blockchain utilities, sync services
hooks/              # Client hooks for stream/chat/metrics state
prisma/             # Prisma schema and migration source of truth
tests/              # API, library, and integration tests
media-server/       # Separate WebSocket/HLS ingest server
gcp/                # GCP setup and deploy scripts
```

## Architecture

```mermaid
flowchart LR
  U[User Browser] --> N[Next.js App<br/>app/ + components/]
  N --> A[API Routes<br/>app/api/*]
  A --> B[Blockchain SDK<br/>lib/alkanes-client.ts]
  A --> C[Prisma ORM<br/>lib/prisma.ts]
  C --> D[(PostgreSQL)]
  A --> E[Cache + Locks<br/>lib/redis.ts]
  E --> F[(Redis)]
  N --> G[Stream APIs<br/>app/api/stream/*]
  G --> H[Media Server<br/>media-server/]
  H --> I[(GCS HLS Segments)]
  N --> J[/stream/* rewrite]
  J --> I
```

## Utilities and Core Modules

Important utility modules under `lib/`:

- `lib/alkanes-client.ts` and `lib/alkanes-client-v2.ts`: Alkanes SDK/provider wiring and RPC helpers
- `lib/blockchain-data.ts`: shared fetch/transform helpers used by API and tests
- `lib/sync-service.ts`: sync orchestration for wrap/unwrap and snapshots
- `lib/redis.ts`: Redis cache + distributed lock helpers with memory fallback
- `lib/prisma.ts`: Prisma client lifecycle and logging behavior
- `lib/volume-data.ts`: volume aggregation/data API integration
- `lib/stream-client.ts` and `lib/stream-types.ts`: stream transport configuration and types
- `lib/community-bridge.ts`: bridge calls to app.subfrost.io

## API Surface (High-Level)

Current route groups in `app/api/`:

- [app/api/admin](app/api/admin) (reset, status, maintenance)
- [app/api/btc-price](app/api/btc-price)
- [app/api/frbtc-issued](app/api/frbtc-issued)
- [app/api/alkanes-btc-locked](app/api/alkanes-btc-locked)
- [app/api/alkanes-circulating](app/api/alkanes-circulating)
- [app/api/alkanes-total-unwraps](app/api/alkanes-total-unwraps)
- [app/api/brc20-btc-locked](app/api/brc20-btc-locked)
- [app/api/brc20-circulating](app/api/brc20-circulating)
- [app/api/brc20-total-unwraps](app/api/brc20-total-unwraps)
- [app/api/prefetch](app/api/prefetch)
- [app/api/room](app/api/room)
- [app/api/stream](app/api/stream) (start/stop/live/focus/captions)
- [app/api/volume](app/api/volume)
- [app/api/health](app/api/health)

## Local Development

### Prerequisites

- Node.js 20
- pnpm 9
- Docker (for local Postgres/Redis/media-server)

### 1) Install dependencies

```bash
pnpm install
```

### 2) Configure environment

```bash
cp .env.example .env
```

At minimum for local app development:

- `DATABASE_URL`
- `REDIS_URL`
- `ALKANES_RPC_URL`
- `NEXT_PUBLIC_NETWORK`
- `ADMIN_SECRET`

### 3) Start local infrastructure

```bash
pnpm docker:up
pnpm db:push
```

Or one command:

```bash
pnpm setup:local
```

### 4) Run the app

```bash
pnpm dev
```

App runs at `http://localhost:3000`.

## Scripts

### Application

- `pnpm dev`: start Next.js dev server
- `pnpm build`: production build
- `pnpm start`: run built app
- `pnpm lint`: run Next.js lint

### Tests

- `pnpm test`: run all tests (CI command)
- `pnpm test:watch`: watch mode
- `pnpm test:coverage`: run with coverage
- `pnpm test:api`: API test subset
- `pnpm test:lib`: library test subset
- `pnpm test:live`: networked integration tests (`RUN_INTEGRATION=true`)
- `pnpm test:live:rpc`: RPC integration only
- `pnpm test:live:api`: live API integration only

### Database

- `pnpm db:generate`: generate Prisma client
- `pnpm db:push`: push schema to DB (dev)
- `pnpm db:migrate`: create/apply local migration (dev)
- `pnpm db:migrate:deploy`: apply migrations (production)
- `pnpm db:studio`: open Prisma Studio

### Infrastructure

- `pnpm docker:up` / `pnpm docker:down`: local docker services
- `pnpm gcp:setup`: provision GCP infrastructure
- `pnpm gcp:deploy`: deploy to Cloud Run
- `pnpm gcp:setup-wif`: configure GitHub WIF

## Testing Notes

- Vitest runs with `happy-dom` and a forked pool to support WASM-heavy SDK tests.
- CI executes `pnpm test` in GitHub Actions.
- Network-dependent integration tests are gated/skipped in CI to reduce RPC flake risk.
- `tests/setup.ts` sets default test env values for DB/Redis/RPC.

## Admin Endpoints

Admin routes require `x-admin-secret` (or route-specific bearer auth in stream routes) matching `ADMIN_SECRET`.

Example:

```bash
curl -X GET http://localhost:3000/api/admin/sync-status \
  -H "x-admin-secret: your-admin-secret"
```

## Live Streaming

- Main app streaming endpoints live under `app/api/stream/`.
- The separate ingest/transcode service is in `media-server/`.
- CDN/stream rewrite behavior is configured in `next.config.mjs` via `/stream/:path*`.

For full streaming ops setup, see `STREAM.md`.

## Deployment

- App Docker build is defined in `Dockerfile` (multi-stage, standalone Next.js output).
- CI workflow is in `.github/workflows/ci.yml`.
- GCP provisioning/deployment scripts are in `gcp/`.

## Environment Variables Reference

Commonly used variables across app and media services:

- `DATABASE_URL`
- `REDIS_URL`
- `ALKANES_RPC_URL`
- `ALKANODE_DATA_API`
- `NEXT_PUBLIC_NETWORK`
- `NEXT_PUBLIC_MEDIA_SERVER_URL`
- `NEXT_PUBLIC_STREAM_CDN_URL`
- `NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID`
- `ADMIN_SECRET`
- `STREAM_SECRET`
- `PREFETCH_SECRET`
- `SUBFROST_APP_URL`
- `SUBFROST_APP_API_KEY`
- `GCS_BUCKET`
- `MAIN_APP_URL`
- `LOCAL_MODE`

Use `.env.example` as the starting point for local development.
