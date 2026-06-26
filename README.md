# subfrost.io

subfrost is a Next.js 16 application for Bitcoin/frBTC metrics, history, and live conference streaming, backed by Prisma/PostgreSQL, Redis caching, and an auxiliary media ingest server.

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
brand/              # Client-provided brand kit and implementation notes
components/         # Reusable React UI components
lib/                # Data clients, blockchain utilities, sync services
hooks/              # Client hooks for stream/chat/metrics state
prisma/             # Prisma schema and migration source of truth
tests/              # API, library, and integration tests
media-server/       # Separate WebSocket/HLS ingest server
gcp/                # GCP setup and deploy scripts
design.md           # Site-wide design direction based on the articles redesign
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

## CMS vs Git-Managed Surfaces

Article content is CMS-managed, not git-managed:

- Public article pages (`/articles`, `/articles/[slug]`, `/authors/[id]`) read published records from Postgres via `lib/cms/articles.ts`.
- Admin article operations live under `/admin` and `/admin/articles/*`.
- The CMS owns article titles, excerpts, body markdown, EN/ZH translations, authors, tags, status, featured flags, and cover image URLs.
- Local preview content comes from `pnpm db:seed:articles:local`; those mock records are development-only database data and should not be treated as source content.

Git owns the site shell and presentation:

- Article index and reader layout/design: `app/articles/page.tsx`, `app/articles/[slug]/page.tsx`, `components/articles/*`, and the scoped editorial styles in `app/globals.css`.
- Public taxonomy presentation, such as mapping CMS tags into visible nav buckets like Research, Protocol, and Docs.
- The Docs topic on `/articles` includes git-managed outbound cards to `docs.subfrost.io` when no published CMS posts are tagged for Docs.
- The `/developer` page is a git-managed developer gateway for docs, technical overview, API docs, app entry, protocol updates, and support. It does not replace `docs.subfrost.io`; deep docs remain external until that repo is available.
- The `/articles` subscribe panel posts to `app/api/articles/subscribe` and stores records in the `ArticleSubscriber` table. Notification delivery is a separate workflow and is not implied by the public form.
- Editorial language routing is git-managed. `/articles`, article readers, and author pages default to Chinese for CN/HK visitors or browsers with Chinese system language only when there is no explicit `?lang=` and no saved `subfrost_locale` cookie. Manual language toggles persist and must win over automatic detection.
- SEO discovery routes are git-managed but read CMS data at runtime: `/sitemap.xml`, `/robots.txt`, and `/llms.txt`.
- Netlify deploy previews use a small git-managed fallback article set only when CMS reads are unavailable, so design review remains possible without production CMS access.
- Marketing/home page layout, stats boxes, reusable components, and non-editorial copy.

When updating editorial content, use the CMS. When updating structure, navigation, typography, responsive behavior, or visual design, change the repo and deploy through the normal git/Flux path.

## Design Direction

The `/articles` redesign is the current target design language for the broader `subfrost.io` site. Future site work should extend that system instead of creating one-off page styles.

Before changing site design, read:

- `design.md`: site-wide design principles, layout rules, interaction rules, SEO expectations, and QA checklist
- `brand/subfrost/README.md`: official brand assets, logo usage, palette, and typography notes
- `app/globals.css`: editorial CSS variables and responsive rules
- `components/articles/*`: current implementation patterns for header, footer, cards, filters, search, language, and theme controls
- `app/developer/page.tsx`: developer gateway pattern for future docs-adjacent pages

Core decisions:

- Use Geist across the editorial/product shell.
- Use the official logotype, not ad hoc text, for the header.
- Prefer lowercase `subfrost` as the public wordmark across marketing, footer, brand kit, and unfurl surfaces.
- Use `SUBFROST` only for legacy product/legal copy or constrained system contexts that already rely on all-caps recognition. Do not introduce title-case `Subfrost` as a visual brand treatment.
- Light mode uses `logotype_black.svg`; dark mode uses `logotype_white.svg`.
- Keep the OpenAI-inspired editorial shape: white/black canvas, small image radii, minimal hover states, generous spacing, no decorative card chrome, no unnecessary borders.
- Keep article content CMS-managed; only design and fallback preview data live in git.

## AI Agent Workflow

This repo is prepared for AI-assisted design and engineering work. Agents should optimize for small, reviewable changes that preserve CMS ownership and keep the site visually consistent.

Start here:

1. Read this README.
2. Read `design.md`.
3. Read `brand/subfrost/README.md`.
4. Inspect the files that own the surface being changed before editing.

For design work:

```bash
pnpm install
pnpm exec impeccable install
pnpm impeccable
```

`pnpm exec impeccable install` installs/refreshes the local Impeccable design skills and hooks. `pnpm impeccable` runs a targeted design-quality scan against the articles surface, editorial components, global styles, and public brand assets. Use `pnpm impeccable:site` for broader site work.

Before handoff:

```bash
pnpm exec tsc --noEmit
pnpm test -- tests/articles
pnpm build
pnpm impeccable
```

Then complete a browser QA pass across desktop, tablet, and mobile. Check light/dark mode, EN/ZH, article index, filtered topic views, at least one article reader, console errors, image loading, layout shift, and public preview reachability when a review link is requested.

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

If Docker Compose is not installed locally, start the required services directly:

```bash
docker run -d --name subfrost-postgres \
  -e POSTGRES_USER=subfrost \
  -e POSTGRES_PASSWORD=subfrost_dev_password \
  -e POSTGRES_DB=subfrost \
  -p 5432:5432 \
  postgres:16-alpine

docker run -d --name subfrost-redis \
  -p 6379:6379 \
  redis:7-alpine

pnpm db:push
```

### 4) Run the app

```bash
pnpm dev
```

App runs at `http://localhost:3000`.

### Article CMS preview data

The public article index and reader pages depend on published CMS records. For local design and QA work:

```bash
pnpm db:seed:articles:local
pnpm dev
```

Then open `http://localhost:3000/articles`.

To preview the production CMS article feed locally without production database access, set:

```bash
ARTICLE_PREVIEW_API_URL="https://subfrost.io/api/articles"
pnpm dev
```

Localhost normally uses fallback article data so deploy previews stay reviewable without CMS access. `ARTICLE_PREVIEW_API_URL` overrides that fallback with the public production article API and is useful for checking real cover-image behavior inside the local design system.

### Article cover image guidance

CMS article covers should be uploaded as editorial thumbnails, not full-width hero lockups.

Recommended upload specs:

- **Aspect ratio:** `24:11` preferred for article covers. The current production CMS banner is `1440 x 660`, and the article index is tuned around that shape.
- **Minimum size:** `1200 x 550`.
- **High quality target:** `1920 x 880` when the source image is detailed and clean.
- **File type:** JPG/WebP for photographic or rendered frost imagery; PNG only when transparency or sharp logo artwork is required.
- **Safe area:** keep logos, wordmarks, and important text away from the outer 8% on every side. The frontend preserves the full CMS cover with `object-fit: contain`, but small screens and social previews can still compress edge detail.
- **Avoid:** text-heavy graphics, full-width brand banners, tiny logos near edges, hard borders baked into the image, screenshots with UI chrome, and images that only work uncropped.

Frontend behavior:

- Article cards and featured articles use a `24:11` frame and preserve the full CMS cover.
- Broken or missing CMS images fall back to the git-managed frost cover art.
- The lead image loads eagerly; lower article images lazy-load.
- The layout preserves stable image dimensions to prevent jumpy page loads.

SEO endpoints to spot-check during article work:

- `http://localhost:3000/sitemap.xml`
- `http://localhost:3000/robots.txt`
- `http://localhost:3000/llms.txt`

## Scripts

### Application

- `pnpm dev`: start Next.js dev server
- `pnpm build`: production build
- `pnpm impeccable`: targeted Impeccable design scan for the articles surface
- `pnpm impeccable:site`: broader Impeccable scan for full-site redesign work
- `pnpm start`: run built app
- `pnpm lint`: currently needs migration off `next lint` for Next.js 16; use typecheck/build until the ESLint command is updated

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
- `pnpm db:seed:articles:local`: seed 6 local mock published articles (refuses non-local DB hosts)

Local mock article seeding safety:

- The seed command is intentionally local-only and aborts when `DATABASE_URL` is not a loopback/local host.
- It also aborts in cloud runtime environments (`VERCEL`, `GCP_PROJECT`, `K_SERVICE`).
- It upserts only the known mock slugs and is meant for local development preview data.

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
