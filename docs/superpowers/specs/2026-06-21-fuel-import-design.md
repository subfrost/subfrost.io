# FUEL allocations import (subfrost-app → subfrost.io) — design

Date: 2026-06-21
Status: approved (brainstorming) — pending spec review
Branch: `feat/fuel-import`

## Goal

Import the FUEL allocations from subfrost-app's Postgres (`fuel_allocations`) into
subfrost.io's `FuelAllocation` table, idempotently, mirroring the referral
migration's parse + load separation. This is the FUEL half of flex's **Frente 2**
data imports (the FinCEN/AML import is a separate task). It is a **data migration**:
the `FuelAllocation` table already exists in prod, so there is **no schema change**.

## Decisions (locked during brainstorming)

1. **Conflict policy = upsert by `address`, source wins.** Reuse the existing
   `upsertAllocations` from `lib/fuel/admin.ts` (upsert by address: update
   amount/note for matching addresses, insert new ones). Idempotent; preserves any
   subfrost.io-only addresses not present in the source.
2. **Acquisition = self-served snapshot.** `cloud-sql-proxy` (bestary SA) reaches
   subfrost-app's `subfrost-db`; a Prisma `$queryRaw` reads `fuel_allocations` and
   writes a JSON snapshot to `.bestary-extracted/dump/fuel_allocations.json`. No
   gcloud / pg_dump / GCS required.
3. **Timestamps not applied to the target now.** The load uses `upsertAllocations`
   as-is, so the target's `createdAt`/`updatedAt` are import-time. **The snapshot
   captures ALL source columns** (`id, address, amount, note, created_at,
   updated_at`), so the original timestamps stay recoverable later — from the
   snapshot, and from the source DB until subfrost-app is decommissioned. A future
   `createdAt` backfill (match by address) is possible but out of scope.

## Source & target shapes

| | Source `public.fuel_allocations` (subfrost-app) | Target `FuelAllocation` (subfrost.io) |
|---|---|---|
| id | `text` PK | `cuid` PK |
| address | `text` UNIQUE | `String @unique` |
| amount | `double precision` | `Float` |
| note | `text` nullable | `String?` |
| created_at / updated_at | `timestamp` | `createdAt @default(now())` / `updatedAt @updatedAt` |

Identical shape, single table, **no foreign keys** — far simpler than the referral
graph (no topo-sort, no FK ordering).

`upsertAllocations` already validates: address `trim()` (required), amount
`round2` + finite + `>= 0`, note `trim() || null`; upserts in one `$transaction`;
**`MAX_ENTRIES = 500` per call**.

## Architecture (units)

```
scripts/dump-fuel-allocations.ts   (NEW; acquisition, bestary side; integration — not unit-tested)
  ├─ starts cloud-sql-proxy (bestary SA) → lithomantic-heaven-bestary:us-central1:subfrost-db
  ├─ PrismaClient(datasource = SOURCE url) → $queryRawUnsafe(
  │     "SELECT id, address, amount, note, created_at, updated_at
  │        FROM public.fuel_allocations ORDER BY address")
  └─ writes the full rows as JSON → .bestary-extracted/dump/fuel_allocations.json

lib/fuel/migrate.ts                 (NEW; pure, unit-tested)
  ├─ parseFuelDump(jsonText): FuelEntry[]
  │     JSON.parse → assert array → map each to { address, amount, note }
  │     (ignores id/timestamps for the load; they live on in the snapshot)
  └─ migrateFuelAllocations(entries, opts?): Promise<{ total: number; chunks: number }>
        chunks entries into ≤ chunkSize (default 500), calls opts.upsert per chunk
        (default = upsertAllocations from lib/fuel/admin), sums counts

scripts/migrate-fuel-data.ts        (NEW; runner, io side)
  ├─ reads the JSON snapshot (default .bestary-extracted/dump/fuel_allocations.json)
  ├─ parseFuelDump → entries; prints count + total amount + a sample
  ├─ --dry-run: stop here (no DATABASE_URL needed, no writes)
  └─ real run: requires DATABASE_URL (subfrost.io via io cloud-sql-proxy) →
        migrateFuelAllocations(entries) → prints { total, chunks }

tests/fuel/migrate.test.ts          (NEW)
```

### Why reuse `upsertAllocations`

The migration must write data exactly as the admin does (same validation,
normalization, address-keyed upsert). Reusing the function guarantees that and
keeps the loader tiny; the migration only owns parsing + chunking.

## Data flow

1. **Acquire** (run once, bestary side): proxy → source DB → `$queryRaw` → JSON
   snapshot on disk. Read-only on the source.
2. **Load** (io side): read snapshot → `parseFuelDump` → `migrateFuelAllocations`
   → `upsertAllocations` per ≤500 chunk, sequentially, each chunk one transaction.
3. **`--dry-run`** validates the snapshot parses and prints counts without any DB
   connection or write.

## Interfaces

- `FuelEntry` (existing, `lib/fuel/admin.ts`): `{ address: string; amount: number; note?: string | null }`
- `upsertAllocations(entries: FuelEntry[]): Promise<{ count: number }>` (existing, reused unchanged)
- `parseFuelDump(jsonText: string): FuelEntry[]` (new)
- `migrateFuelAllocations(entries: FuelEntry[], opts?: { chunkSize?: number; upsert?: (e: FuelEntry[]) => Promise<{ count: number }> }): Promise<{ total: number; chunks: number }>` (new)

## Error handling

- `parseFuelDump`: throw a clear error on non-array / malformed JSON; never silently
  skip rows.
- `upsertAllocations` already throws `FuelError` on bad address/amount — surfaced by
  the runner.
- Acquisition: fail loudly if the proxy/connection fails; write the snapshot **only
  on a successful read**; warn (don't crash) if the source returns 0 rows.
- Idempotent end-to-end: re-running dump+load converges to the same target state.

## Testing

`tests/fuel/migrate.test.ts` (vitest, no live DB — mirrors `tests/referral/migrate.test.ts`):

- `parseFuelDump`:
  - valid JSON array → `FuelEntry[]` with address/amount/note mapped.
  - `note` absent or `null` → `null`.
  - non-array JSON (e.g. `{}` or `"x"`) → throws.
  - malformed JSON → throws.
- `migrateFuelAllocations` (inject a mock `upsert` to assert chunking):
  - 1100 entries, chunkSize 500 → 3 chunks (500/500/100), mock called 3×, each call
    ≤ 500, `total` = 1100, `chunks` = 3.
  - empty entries → `{ total: 0, chunks: 0 }`, mock never called.
  - entries pass through to `upsert` unchanged (same address/amount/note).

Acquisition and the live load are pure I/O against the two proxied prod DBs and are
verified manually (dry-run, then real run), not unit-tested.

## Verification & run

- `node_modules/.bin/tsc --noEmit` → 0; `CI=true node_modules/.bin/vitest run` →
  green (new fuel/migrate tests + existing suite); `node_modules/.bin/next build` → 0.
- **Code** ships via branch → PR → merge to `main` (repo policy). **No image bump /
  Flux**: this changes no running app code, only data rows — the live `/admin/fuel`
  reads `FuelAllocation` and will show the imported rows immediately after the load.
- **Operational run** (after merge; manual, not part of deploy):
  1. `npx tsx scripts/dump-fuel-allocations.ts` (bestary proxy) → inspect the JSON
     snapshot count.
  2. `npx tsx scripts/migrate-fuel-data.ts --dry-run` → confirm parsed count/total.
  3. `npx tsx scripts/migrate-fuel-data.ts` with `DATABASE_URL` (io proxy) → load.
  4. Spot-check: `/admin/fuel` (live) shows the allocations; total matches the dump.
- **Runner risk:** scripts run via `npx tsx` (referral precedent; `tsx` is not a
  local dep). Confirm `npx tsx` works in this environment at execution; fallback is
  compiling to JS or a small `.mjs` shim.

## Out of scope (YAGNI)

- The FinCEN/AML import (separate Frente 2 task).
- Backfilling source timestamps into the target (recoverable later from the snapshot).
- Preserving source `id`s (no FK depends on them; address is the natural key).
- Any UI for re-import or a scheduled sync (this is a one-time migration).
