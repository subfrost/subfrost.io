# FUEL display fix (subfrost.io public read + subfrost-app remote flip) — design

Date: 2026-06-22
Status: approved (brainstorming) — pending spec review
Branches: `feat/fuel-public-read` (subfrost.io) · `feat/fuel-remote-read` (subfrost-app)

## Problem

FUEL allocations created in `subfrost.io/admin` do **not** appear in the
`app.subfrost.io` wallet (balances). Old allocations still appear.

**Root cause (confirmed):** the two surfaces read/write different databases.

| | DB | Notes |
|---|---|---|
| **Write** (`subfrost.io/admin`) | `subfrost-postgres` (io, public) | `lib/fuel/admin.ts` `upsertAllocations`, gated by `FUEL_EDIT` via `actions/cms/fuel.ts` |
| **Read** (`app.subfrost.io`) | `subfrost-db` (Cloud SQL, bestary, private-IP) | `subfrost-app/app/api/fuel/route.ts` → `prisma.fuelAllocation.findUnique` |

Old allocations appear because they predate the migration (they live in the old
`subfrost-db`). New allocations land only in `subfrost-postgres`, which the app
never reads.

## Goal

Make the app read FUEL from the same database the admin writes to, **without**
cross-cluster DB coupling — by having subfrost.io own a public read endpoint and
the app fetch it server-side. This mirrors the referral inversion already shipped
(`subfrost-app/lib/referral-remote.ts` → `subfrost.io/api/invite-codes/lookup`).

## Decisions (locked during brainstorming)

1. **Endpoint, not DB repoint.** subfrost.io exposes `GET /api/fuel?address=`; the
   app fetches it server-side. *Rejected alternative:* point the app's Prisma
   `DATABASE_URL` at `subfrost-postgres` — cross-cluster private networking,
   separate credentials, divergent schemas, and it breaks the established
   "io owns the data, app consumes via API" inversion pattern.
2. **Public, no auth** on the io endpoint. Matches today's behavior: the app's
   `/api/fuel` is already a public, unauthenticated browser endpoint, so the
   effective public exposure is unchanged. (We considered the `X-API-Key`
   service-key pattern used by `invite-codes/lookup`; chose to keep it public for
   simplicity since FUEL amounts per public BTC address are not sensitive.)
3. **Env-gated flip on the app side**, mirroring `referral-remote.ts`. When
   `SUBFROST_IO_FUEL_URL` is set the app reads remote; when unset it keeps the local
   `prisma.fuelAllocation.findUnique` (legacy / local-dev). This gives a zero-rollback
   safety valve (unset the env → old behavior) and keeps local dev working without io.
   **No API key** for fuel (unlike referral) — the io endpoint is public.
4. **Exact-match address**, no case normalization — consistent with the admin
   `upsertAllocations`, which only `trim()`s. The wallet sends taproot then payment
   address as separate `/api/fuel` calls (`useFuelAllocation.ts`); one address per
   call, unchanged.
5. **Light cache on io** (`cacheGet/cacheSet`, key `fuel:public:{address}`, TTL 60s),
   matching the `frbtc-issued` route's use of the same helper. Protects the io DB
   from per-wallet-connect read bursts. The app keeps its own Redis 60s cache too.
6. **Never fall back to the stale DB when remote is enabled.** If the remote fetch
   fails while `SUBFROST_IO_FUEL_URL` is set, return `{amount:0}` — the old
   `subfrost-db` is the source of the bug and must not be read on the remote path.
   (The app's existing Redis 60s cache still serves a last-good value within TTL;
   that's a side effect of the cache, not a DB fallback.)

## Shapes (unchanged contract)

Response shape stays `{ amount: number }` end-to-end — dictated by the app's
existing consumer (`parseFuelAmount` in the app route + `useFuelAllocation.ts`).
`FuelAllocation` schema is identical in both repos (`address @unique`, `amount Float`),
already in prod — **no schema change, no migration**.

## Repo 1 — subfrost.io (owns the read)

New `app/api/fuel/route.ts`:
- `GET ?address=`, public (no auth), `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
- Validate `address` → 400 if missing/empty.
- `cacheGet<{amount:number}>("fuel:public:" + address)`; on hit, return it.
- `prisma.fuelAllocation.findUnique({ where: { address }, select: { amount: true } })`.
- `const result = { amount: allocation?.amount ?? 0 }`; `cacheSet(key, result, 60)`.
- Return `NextResponse.json(result)`. On error → 500 `{ error }` (app treats non-OK as 0).

## Repo 2 — subfrost-app (remote flip, own branch off `main`)

New `lib/fuel-remote.ts` (mirror `referral-remote.ts`, keyless):
- `const baseUrl = () => process.env.SUBFROST_IO_FUEL_URL?.replace(/\/+$/, "")`
- `export function isRemoteFuelEnabled(): boolean { return Boolean(baseUrl()) }`
- `export async function remoteFuelLookup(address): Promise<{ amount: number }>` —
  `fetch(`${baseUrl()}/api/fuel?address=${encodeURIComponent(address)}`,
  { signal: AbortSignal.timeout(5000) })`; parse `{amount}` defensively.

Edit `app/api/fuel/route.ts`:
- If `isRemoteFuelEnabled()` → `remoteFuelLookup(address)` for the amount.
- Else → keep existing `prisma.fuelAllocation.findUnique` (legacy/dev path).
- Preserve: address validation (400), Redis 60s cache, `parseFuelAmount`,
  `DEV_FUEL_ALLOCATIONS` (dev-only, `NODE_ENV !== production`), error → `{amount:0}`.
- On the remote path, a failed fetch returns `{amount:0}` — never the local DB.

`hooks/useFuelAllocation.ts`: **unchanged** (same `/api/fuel` endpoint, same `{amount}`).

## Tests (TDD)

- **io** `app/api/fuel/__tests__/route.test.ts` (vitest): allocation present → amount;
  absent → `{amount:0}`; missing param → 400; prisma mocked; cache hit path.
- **app** `lib/__tests__/fuel-remote.test.ts`: builds URL from env, returns parsed
  `{amount}`, timeout/error → safe; `isRemoteFuelEnabled` env gate (mirror
  `referral-remote.test.ts`).
- **app** route test: remote enabled → uses `remoteFuelLookup`; remote disabled →
  uses local DB; io-down → `{amount:0}`.

## Deploy & dependencies

- **subfrost.io:** PR → merge → GitHub Actions "Deploy to GCP" builds + pushes
  short-sha image (the "Deploy to Cloud Run" step fails — legacy, ignore) → bump
  `newTag` in `k8s/kustomization.yaml` → Flux rolls GKE.
- **subfrost-app:** PR → app's own pipeline (confirm `deploy.yml` in the plan —
  Cloud Run vs GKE).
- **Env dependency (flex lane):** set `SUBFROST_IO_FUEL_URL=https://subfrost.io` in
  the app's env (same lane as `SUBFROST_IO_REFERRAL_URL`). Until set, the app stays
  on the local DB (safe flip). Document this so the fix isn't "deployed but dark."

## Verification

1. Allocate a fresh address in `subfrost.io/admin/fuel`.
2. `curl https://subfrost.io/api/fuel?address=<addr>` → returns the amount.
3. `curl https://app.subfrost.io/api/fuel?address=<addr>` → returns the same amount
   (after TTL / with `SUBFROST_IO_FUEL_URL` set).
4. An address with no allocation → `{amount:0}`.
5. Confirm pre-existing (old) allocations still resolve correctly.

Gates before each PR (per repo): `npx tsc --noEmit` 0 · `CI=true npx vitest run` green
· `npx next build` 0.
