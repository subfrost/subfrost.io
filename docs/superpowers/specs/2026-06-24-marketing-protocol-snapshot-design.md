# Marketing — Protocol Snapshot (v1) — Design

- **Date:** 2026-06-24
- **Status:** Approved (brainstorm) → ready for implementation plan
- **Area:** subfrost.io `/admin` — new **Marketing** section
- **Author:** Vitor + Claude (brainstorm session)

## Context

The `/admin` already has a tree-structured nav (Overview, Articles, Community,
Compliance, Billing, Financials, Settings) and a durable home-stats layer
(`HomeStat` store → `getStats()` → `/api/stats`, live since 2026-06-24, including
the new `btcDieselRatio`/`btcFireRatio`).

We want a **Marketing** area whose first feature is a **protocol snapshot**: an
admin captures a point-in-time picture of the protocol's key metrics *before*
publishing an article or posting on X, so that afterward we have a baseline to
measure adoption/engagement against. This is the first of a longer marketing
roadmap (engagement metrics — clicks/shares/views — are a separate later front
that needs its own instrumentation).

## Goals

- A **Marketing** nav group in `/admin`, gated by a new `marketing.view` privilege.
- Capture **manual, on-demand snapshots** of protocol + token metrics, each with
  an optional lightweight post reference (label, context, external URL, article).
- Persist snapshots durably (Postgres) so they form a baseline series.
- **Compare** any two snapshots, or a snapshot vs. **live now**, with field-by-field
  deltas (absolute + %).
- Include **holder counts** for DIESEL / FIRE / frBTC (verified feasible — see
  Data Sources).

## Non-goals (YAGNI for v1)

- No engagement metrics (clicks/shares/views) — separate front, needs instrumentation.
- No campaign/post entity that auto-pairs before/after — the optional post-reference
  fields seed this; a real campaign model waits until engagement data exists.
- No scheduled/auto daily baseline — manual capture covers the stated need; a cron
  can be layered on later (the data model already supports it).
- No public-facing surface — admin-internal only.
- Mainnet only (token ids are hardcoded mainnet values).

## Decisions (from brainstorm)

1. **Anchor:** manual standalone snapshot ("capture now") with **optional**
   post-reference fields. A superset of "tied to a post" without coupling to a
   campaign model. "How did the post do?" = compare the pre-post snapshot to a
   later snapshot (or to live).
2. **Data set:** rich. Protocol-level + a rich per-token block for DIESEL, FIRE,
   and frBTC + the BTC ratios.
3. **Holders:** must-have in v1. Feasibility confirmed (cheap, public endpoint).
4. **Approach A — self-contained JSON rows.** Each snapshot is one row with a JSON
   `payload`; capture fetches token data live and reuses the durable store for the
   slow-moving protocol fields. Minimal new surface, flexible payload (new metric =
   no migration).
5. **Gating:** single `marketing.view` privilege gates the whole section (view +
   capture + delete), mirroring the `financials.view` single-privilege pattern.
   Not restricted → ADMIN auto-gets it; grant to marketing staff as needed.

## Data model

New model, **additive** (applied by the `migrate` init container via `prisma db
push` on boot, as with prior deploys — prod starts with zero rows):

```prisma
model MarketingSnapshot {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  createdById String?
  createdBy   User?    @relation("SnapshotCreator", fields: [createdById], references: [id], onDelete: SetNull)
  label       String                       // e.g. "before X post about frBTC"
  context     String   @default("GENERAL") // GENERAL | X_POST | ARTICLE
  refUrl      String?                       // link to the tweet / external post
  articleId   String?                       // optional FK to Article
  article     Article? @relation(fields: [articleId], references: [id], onDelete: SetNull)
  note        String?                       // free note
  payload     Json                          // captured metrics (typed in app)
  @@index([createdAt])
}
```

Back-relations: `User.marketingSnapshots MarketingSnapshot[] @relation("SnapshotCreator")`
and `Article.marketingSnapshots MarketingSnapshot[]`.

`context` is a plain `String` with an app-level union (avoids a Postgres enum
migration; consistent with how `ArticleSubscriber.source` etc. are modeled).

### Payload (typed in app via a zod schema + TS interface; opaque JSON in DB)

```ts
interface SnapshotTokenBlock {
  id: string                      // "2:0"
  name: string | null
  symbol: string | null
  holders: number | null
  priceUsd: number | null
  supply: string | null          // integer string (token base units)
  marketcapUsd: number | null
  fdvUsd: number | null
  volume24hUsd: number | null
  priceChange24h: number | null
  priceChange7d: number | null
  priceChange30d: number | null
}

interface SnapshotPayload {
  capturedAt: string             // ISO timestamp of capture
  protocol: {
    totalBtcLocked: number | null   // alkanes + brc20
    alkanesBtcLocked: number | null
    brc20BtcLocked: number | null
    btcUsd: number | null
    btcHeight: number | null
    metashrewHeight: number | null
    source: 'store'                 // protocol fields read from the durable store (≤25min)
  }
  tokens: {
    diesel: SnapshotTokenBlock
    fire: SnapshotTokenBlock
    frbtc: SnapshotTokenBlock
  }
  ratios: { btcDiesel: number | null; btcFire: number | null }
  partial: boolean               // true if any source failed (some fields null)
}
```

Every numeric field is nullable and guarded: a failed/malformed source yields
`null` for that field and `partial: true`; capture never throws.

## Data sources

### Per-token block — `get-alkane-details` (verified live 2026-06-24)

`POST https://oyl.alkanode.com/get-alkane-details` with body
`{"alkaneId":{"block","tx"}}` returns a rich `data` object per token. Verified
mainnet:

| Token  | id        | holders | priceUsd | supply           |
|--------|-----------|---------|----------|------------------|
| DIESEL | `2:0`     | 7891    | 67.45    | 65712934154469   |
| FIRE   | `2:77623` | 955     | 53.74    | 2168070187798    |
| frBTC  | `32:0`    | 2246    | 51881.89 | 10037507190      |

Semantic fields consumed (→ payload field): holders → `holders`, price USD →
`priceUsd`, supply → `supply`, market cap USD → `marketcapUsd`, fully-diluted
valuation USD → `fdvUsd`, 24h volume USD → `volume24hUsd`, 24h/7d/30d price change →
`priceChange24h/7d/30d`, plus `name`/`symbol`. The endpoint returns many keys
(`marketcap`, `fdv`, `fdvUsd`, `tokenVolume1d`, `priceChange24h`, …); the **exact
source-key mapping and units (USD vs sats) are pinned during implementation against
a captured real-response fixture** (TDD), since several keys are ambiguously named
(e.g. plain `marketcap` vs `busdPoolMarketcapInUsd`, `frbtcPoolMarketcapInSats`).
Any key that is missing or non-numeric yields `null`.

- New module `lib/marketing/alkane-details.ts` → `getAlkaneDetails(id, fetchImpl?)`.
  Public, no auth. Env override `ESPO_DETAILS_URL` (default `https://oyl.alkanode.com`),
  mirroring subfrost-app's `token-details` route. Per-field guards; returns a
  `SnapshotTokenBlock` with nulls on any failure (never throws).
- Token ids are hardcoded constants (`DIESEL_ID="2:0"`, `FIRE_ID="2:77623"`,
  `FRBTC_ID="32:0"`). Note: FIRE's token id (`2:77623`) differs from the price
  *pool* id used in `espo-price.ts` (`2:77623-usd`) — same number, different surface.

### Protocol block + ratios — durable store (reuse)

Reuse `getStats()` (`lib/stats.ts`), which already assembles
`alkanesBtcLocked`/`brc20BtcLocked`/`btcUsd`/`btcHeight`/`metashrewHeight` and
`btcDieselRatio`/`btcFireRatio` from the `HomeStat` store (kept warm by
`/api/prefetch`, ≤25min fresh). `totalBtcLocked = alkanesBtcLocked + brc20BtcLocked`
(null if either is null). This avoids the slow (~15-25s) live address-stats call at
capture time; BTC-locked moves slowly so ≤25min staleness is acceptable for a
baseline. The price source difference is documented (token `priceUsd` from
`get-alkane-details` vs. the marquee's `dieselUsd` from the ESPO 10m candle — same
order of magnitude, different surfaces).

### Capture assembler

`lib/marketing/snapshot.ts` → `captureSnapshot(): Promise<SnapshotPayload>`:
fetch the 3 token blocks **in parallel**, read protocol+ratios from `getStats()`,
merge into a `SnapshotPayload` with `capturedAt = now()` and `partial` set if any
piece failed.

## Server action

`actions/marketing/snapshots.ts`:
- `captureSnapshotAction(input: { label; context; refUrl?; articleId?; note? })` —
  gated by `marketing.view`; validates input (zod: label non-empty, context in the
  union, refUrl optional URL, articleId optional); calls `captureSnapshot()`;
  inserts a `MarketingSnapshot` with `createdById = current user`.
- `deleteSnapshotAction(id)` — gated by `marketing.view`.
- `liveSnapshot()` — returns `captureSnapshot()` **without persisting**, for the
  "compare to live now" view.

Gating uses the existing server gating helper against `marketing.view` (same way
financials actions check `financials.view`).

## IAM / gating changes

In `lib/cms/iam/registry.ts`:
- Add `CategoryKey` `"marketing"` and a `CATEGORIES` entry `{ key: "marketing", label: "Marketing" }`.
- Add a privilege: `{ code: "marketing.view", label: "Marketing — view", description: "View and capture protocol marketing snapshots.", category: "marketing", implies: [] }`.
- **Not** added to `RESTRICTED_PRIVILEGES` → ADMIN's bundle auto-includes it.
- Add `VIEW_GATES["/admin/marketing/snapshots"] = { view: "marketing.view" }`.

In `lib/cms/admin-nav.ts`:
- Add a `marketing` `NavGroup` (after `community`), e.g. icon `LineChart`, with one
  leaf: `{ label: "Protocol snapshots", href: "/admin/marketing/snapshots", icon: Camera, privilege: "marketing.view" }`.

## UI

Routes under `/admin/marketing/snapshots` (server components + small client islands,
following existing `/admin` patterns and `AdminShell`):

- **List** `/admin/marketing/snapshots`
  - Table: captured-at, label, context badge, a few headline figures (e.g. DIESEL
    holders & price, Total BTC Locked), captured-by.
  - **"Capture snapshot"** button → form (modal or inline): `label` (required),
    `context` (select GENERAL/X_POST/ARTICLE), `refUrl` (optional), `article`
    (optional picker), `note` (optional) → `captureSnapshotAction` → revalidate.
  - Per-row **delete** (gated).
  - Empty state when there are no snapshots yet.
- **Detail** `/admin/marketing/snapshots/[id]`
  - Formatted payload: protocol block + three token cards (holders / price / supply /
    marketcap / fdv / 24h volume / price-change) + ratios.
  - **"Compare with…"** selector: another snapshot **or "live now"** → field-by-field
    delta (absolute + %, color-coded ↑/↓, null-safe). "Live now" calls `liveSnapshot()`.
  - Shows label/context/refUrl/article/note and who captured it.

`lib/marketing/diff.ts` — pure function diffing two `SnapshotPayload`s into a
flat list of `{ path, before, after, deltaAbs, deltaPct }` rows, null-safe (skips
or marks fields missing on either side).

## Testing (TDD)

- `lib/marketing/alkane-details.ts`: valid response → typed block; malformed/HTTP
  error → all-null block, never throws (mock `fetch`).
- `lib/marketing/snapshot.ts`: assembler merges token blocks + protocol/ratios;
  one token failing → that block null, `partial: true`; protocol from a mocked
  `getStats()`.
- `lib/marketing/diff.ts`: absolute + % deltas; null on either side handled; %
  guards divide-by-zero → null.
- `actions/marketing/snapshots.ts`: capture persists a row with payload + creator;
  gating denies without `marketing.view` (mock `@/lib/prisma` + auth).
- IAM: `marketing.view` resolves/expands; ADMIN bundle includes it; `VIEW_GATES`
  entry present.
- Nav: `visibleNav` shows the Marketing group only with the privilege.
- Components: list + detail + compare render from fixtures.

Conventions: `import prisma from '@/lib/prisma'` (default), mock
`vi.mock('@/lib/prisma',()=>({prisma:client,default:client}))`, zod v3, vitest
happy-dom, `@/` alias.

## Deploy notes

- **Schema is additive** → `migrate` init container (`prisma db push`) creates
  `MarketingSnapshot` on boot. Local gate: `npx prisma generate`.
- **No new warmer key, no cold-start change** — capture reads token data live and
  protocol data from the already-warm store. `/api/prefetch` unchanged.
- Deploy = merge → Cloud Build (short-sha) → bump `newTag` in `k8s/kustomization.yaml`
  via PR → Flux (**gotcha:** reconcile `gitrepository/subfrost-io` source **before**
  `kustomization/subfrost-io`).
- Gates: `npx tsc --noEmit` 0 · `CI=true npx vitest run` green · `npx next build` 0.
- Post-deploy live check: open `/admin/marketing/snapshots` (gated 307 for
  unprivileged), capture one snapshot, confirm holders/price populate, compare-to-live
  works.

## Open questions / future fronts

- **Engagement metrics** (clicks/shares/views): the natural next Marketing feature;
  needs instrumentation from scratch (no analytics today). The snapshot's optional
  post-reference fields will let a future "post performance" view pair a baseline
  snapshot with engagement deltas.
- **Campaign entity** that groups snapshots + engagement around a post — later, once
  engagement exists.
- **Scheduled daily baseline** — optional cron layered on Approach A.
- **`marketing.edit` split** (separate capture/delete from view) — trivial follow-up
  if/when read-only marketing viewers are needed.
- **Holders history / per-height** — ESPO also exposes `essentials.get_holders` with
  a height param (full holder list at a block); out of scope for v1 (we only need the
  count, which `get-alkane-details` gives directly).
