# FUEL allocations import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import subfrost-app's `fuel_allocations` into subfrost.io's `FuelAllocation`, idempotently (upsert by address, source wins), mirroring the referral migration's pure-parse + injected-effect pattern.

**Architecture:** A pure, unit-tested core (`lib/fuel/migrate.ts`: `parseFuelDump` + chunked `migrateFuelAllocations`) plus two thin runnable shells — `scripts/dump-fuel-allocations.ts` (acquire a JSON snapshot from the source DB via cloud-sql-proxy + Prisma raw) and `scripts/migrate-fuel-data.ts` (load the snapshot into the target via the existing `upsertAllocations`). No schema change; data only.

**Tech Stack:** TypeScript, Prisma 5.22 (`$queryRawUnsafe` for the source read; `upsertAllocations` for the target write), vitest, cloud-sql-proxy, `npx tsx` for the scripts.

## Global Constraints

- Windows host. Run a single vitest file: PowerShell `$env:CI='true'; node_modules/.bin/vitest run <file>` (or bash `CI=true node_modules/.bin/vitest run <file>`). Typecheck: `node_modules/.bin/tsc --noEmit`.
- **NEVER `git add .npmrc` and never `git add .`** — add only the exact files each task creates. `.claude/` must not be committed.
- Work on branch `feat/fuel-import` (already created). Integration is branch → PR → merge to `main`. No direct pushes to `main`.
- Reuse, do NOT reimplement: `upsertAllocations` from `lib/fuel/admin.ts` — signature `(entries: FuelEntry[]) => Promise<{ count: number }>`; `FuelEntry = { address: string; amount: number; note?: string | null }`; it validates (address `trim()` required, amount `round2`+finite+`>=0`, note `trim()||null`), upserts by `address` in one `$transaction`, and caps at **`MAX_ENTRIES = 500` entries per call**.
- **No schema change** (the `FuelAllocation` table already exists in prod).
- Scripts must use **relative imports** (e.g. `../lib/fuel/migrate`), matching `scripts/migrate-referral-data.ts` — not the `@/` alias. `lib/fuel/migrate.ts` must stay free of value-level `@/`/prisma imports so it is pure and tsx-runnable (type-only import of `FuelEntry`; the default upsert is a lazy relative dynamic import).
- Scripts are run via `npx tsx` (referral precedent; `tsx` is not a local dep). The dry-run smoke test in Task 3 confirms `npx tsx` works; if it does not, fall back to compiling or a `.mjs` shim and note it.
- Snapshot path (outside the repo): `../.bestary-extracted/dump/fuel_allocations.json` (→ `C:\Alkanes Geral Dev\.bestary-extracted\dump\fuel_allocations.json`).

---

### Task 1: Pure core — `lib/fuel/migrate.ts` (parse + chunked load)

The unit-tested heart: parse a JSON snapshot into `FuelEntry[]`, and load entries in `≤500` chunks via an injected upsert (default = the real `upsertAllocations`). No DB, no `@/` value imports — fully testable.

**Files:**
- Create: `lib/fuel/migrate.ts`
- Test: `tests/fuel/migrate.test.ts`

**Interfaces:**
- Consumes: `FuelEntry` type from `lib/fuel/admin` (type-only); `upsertAllocations` from `lib/fuel/admin` (lazy dynamic import, default effect only).
- Produces:
  - `parseFuelDump(jsonText: string): FuelEntry[]`
  - `interface MigrateResult { total: number; chunks: number }`
  - `migrateFuelAllocations(entries: FuelEntry[], opts?: { chunkSize?: number; upsert?: (entries: FuelEntry[]) => Promise<{ count: number }> }): Promise<MigrateResult>`

- [ ] **Step 1: Write the failing test**

Create `tests/fuel/migrate.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"
import { parseFuelDump, migrateFuelAllocations } from "@/lib/fuel/migrate"
import type { FuelEntry } from "@/lib/fuel/admin"

describe("parseFuelDump", () => {
  it("maps a JSON array of source rows to FuelEntry[] (ignoring id/timestamps)", () => {
    const json = JSON.stringify([
      { id: "x", address: "addrA", amount: 100, note: "hi", created_at: "2026-02-09T00:00:00.000Z", updated_at: null },
      { id: "y", address: "addrB", amount: 50.005, note: null },
    ])
    expect(parseFuelDump(json)).toEqual([
      { address: "addrA", amount: 100, note: "hi" },
      { address: "addrB", amount: 50.005, note: null },
    ])
  })

  it("treats a missing note as null", () => {
    expect(parseFuelDump(JSON.stringify([{ address: "a", amount: 1 }]))[0].note).toBeNull()
  })

  it("throws on non-array JSON", () => {
    expect(() => parseFuelDump(JSON.stringify({ address: "a" }))).toThrow()
  })

  it("throws on malformed JSON", () => {
    expect(() => parseFuelDump("{not json")).toThrow()
  })
})

describe("migrateFuelAllocations", () => {
  it("chunks entries into <=chunkSize and sums the upsert counts", async () => {
    const entries: FuelEntry[] = Array.from({ length: 1100 }, (_, i) => ({
      address: `addr${i}`, amount: i, note: null,
    }))
    const upsert = vi.fn(async (chunk: FuelEntry[]) => ({ count: chunk.length }))
    const res = await migrateFuelAllocations(entries, { chunkSize: 500, upsert })
    expect(upsert).toHaveBeenCalledTimes(3)
    expect(upsert.mock.calls.map((c) => c[0].length)).toEqual([500, 500, 100])
    expect(res).toEqual({ total: 1100, chunks: 3 })
  })

  it("returns zero and never calls upsert for empty input", async () => {
    const upsert = vi.fn(async (c: FuelEntry[]) => ({ count: c.length }))
    const res = await migrateFuelAllocations([], { chunkSize: 500, upsert })
    expect(upsert).not.toHaveBeenCalled()
    expect(res).toEqual({ total: 0, chunks: 0 })
  })

  it("passes entries through to upsert unchanged", async () => {
    const captured: FuelEntry[] = []
    const upsert = vi.fn(async (c: FuelEntry[]) => { captured.push(...c); return { count: c.length } })
    const entries: FuelEntry[] = [{ address: "a", amount: 1, note: "n" }]
    await migrateFuelAllocations(entries, { upsert })
    expect(captured).toEqual(entries)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:CI='true'; node_modules/.bin/vitest run tests/fuel/migrate.test.ts`
Expected: FAIL — cannot resolve `@/lib/fuel/migrate` (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `lib/fuel/migrate.ts`:

```ts
/**
 * Migration of subfrost-app's fuel_allocations into subfrost.io's FuelAllocation.
 * Parses a JSON snapshot (produced by scripts/dump-fuel-allocations.ts) into
 * FuelEntry[] and loads it in <=MAX_ENTRIES chunks via the admin's address-keyed
 * upsert. The snapshot keeps every source column (incl. timestamps) for
 * recoverability; only address/amount/note are loaded — upsertAllocations owns
 * validation/normalization, so the import writes data exactly like the admin UI.
 *
 * Pure here (parse + chunk); the DB effect is injected. The default upsert is a
 * lazy relative dynamic import so this module stays import-pure and tsx-runnable.
 * Runnable entrypoint: scripts/migrate-fuel-data.ts.
 */
import type { FuelEntry } from "./admin"

interface SourceRow {
  address: string
  amount: number
  note?: string | null
}

/** Map a JSON snapshot array → FuelEntry[]. Ignores id/timestamps (kept in the
 *  snapshot for recoverability). Throws on non-array or malformed JSON. */
export function parseFuelDump(jsonText: string): FuelEntry[] {
  const parsed = JSON.parse(jsonText)
  if (!Array.isArray(parsed)) {
    throw new Error("fuel dump must be a JSON array of allocation rows")
  }
  return (parsed as SourceRow[]).map((r) => ({
    address: r.address,
    amount: r.amount,
    note: r.note ?? null,
  }))
}

export interface MigrateResult {
  total: number
  chunks: number
}

/** Upsert entries in <=chunkSize batches (default 500, the upsertAllocations
 *  MAX_ENTRIES cap), summing counts. The upsert effect is injected for testing;
 *  the default lazily imports the real address-keyed admin upsert. Idempotent. */
export async function migrateFuelAllocations(
  entries: FuelEntry[],
  opts: {
    chunkSize?: number
    upsert?: (entries: FuelEntry[]) => Promise<{ count: number }>
  } = {},
): Promise<MigrateResult> {
  const chunkSize = opts.chunkSize ?? 500
  const upsert = opts.upsert ?? (await import("./admin")).upsertAllocations

  let total = 0
  let chunks = 0
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize)
    const { count } = await upsert(chunk)
    total += count
    chunks += 1
  }
  return { total, chunks }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:CI='true'; node_modules/.bin/vitest run tests/fuel/migrate.test.ts`
Expected: PASS (all 7 tests). The injected `upsert` means `./admin` (and prisma) is never loaded in the test.

- [ ] **Step 5: Commit**

```bash
git add lib/fuel/migrate.ts tests/fuel/migrate.test.ts
git commit -m "feat(fuel): snapshot parse + chunked idempotent load core"
```

---

### Task 2: Acquisition shell — `scripts/dump-fuel-allocations.ts`

A thin runnable shell that reads `fuel_allocations` from the source DB (via a Prisma client pointed at the proxied source URL) and writes a full-column JSON snapshot. Pure I/O against a live DB — verified by typecheck here; the live run is an operational step (see the spec's run section).

**Files:**
- Create: `scripts/dump-fuel-allocations.ts`

**Interfaces:**
- Consumes: `@prisma/client` `PrismaClient` (instantiated with `datasourceUrl` = the source URL); env `FUEL_SOURCE_DATABASE_URL`.
- Produces: a JSON file at `../.bestary-extracted/dump/fuel_allocations.json` — an array of `{ id, address, amount, note, created_at, updated_at }` rows (all source columns).

- [ ] **Step 1: Write the script**

Create `scripts/dump-fuel-allocations.ts`:

```ts
/**
 * Acquire a snapshot of subfrost-app's fuel_allocations into a JSON file, so the
 * load (scripts/migrate-fuel-data.ts) can run idempotently without re-hitting the
 * source. Reads ALL columns (incl. timestamps) so the original data stays
 * recoverable even though the load only applies address/amount/note.
 *
 * Run from the repo root, with cloud-sql-proxy pointed at the bestary instance
 * (lithomantic-heaven-bestary:us-central1:subfrost-db) and FUEL_SOURCE_DATABASE_URL
 * set to the proxied source connection string:
 *
 *   npx tsx scripts/dump-fuel-allocations.ts [outfile]
 *
 * Read-only on the source.
 */
import { mkdirSync, writeFileSync } from "fs"
import { dirname } from "path"
import { PrismaClient } from "@prisma/client"

const DEFAULT_OUT = "../.bestary-extracted/dump/fuel_allocations.json"

interface FuelSourceRow {
  id: string
  address: string
  amount: number
  note: string | null
  created_at: Date
  updated_at: Date
}

async function main() {
  const outPath = process.argv.slice(2).filter((a) => !a.startsWith("--"))[0] ?? DEFAULT_OUT
  const url = process.env.FUEL_SOURCE_DATABASE_URL
  if (!url) {
    throw new Error("FUEL_SOURCE_DATABASE_URL is required (proxied subfrost-app source DB).")
  }

  const prisma = new PrismaClient({ datasourceUrl: url })
  try {
    const rows = await prisma.$queryRawUnsafe<FuelSourceRow[]>(
      "SELECT id, address, amount, note, created_at, updated_at FROM public.fuel_allocations ORDER BY address",
    )
    if (rows.length === 0) {
      console.warn("WARNING: source returned 0 rows — writing an empty snapshot.")
    }
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, JSON.stringify(rows, null, 2), "utf-8")
    const total = rows.reduce((s, r) => s + r.amount, 0)
    console.log(`Wrote ${rows.length} allocations (total amount ${total}) → ${outPath}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: 0 errors (the script type-checks; `$queryRawUnsafe<FuelSourceRow[]>` and the Prisma `datasourceUrl` option are valid for Prisma 5.22).

If `tsc --noEmit` does not cover `scripts/` (check `tsconfig.json` `include`), additionally confirm no type errors by running `node_modules/.bin/tsc --noEmit --skipLibCheck --module nodenext --moduleResolution nodenext scripts/dump-fuel-allocations.ts` and report the result.

- [ ] **Step 3: Commit**

```bash
git add scripts/dump-fuel-allocations.ts
git commit -m "feat(fuel): source snapshot acquisition script"
```

---

### Task 3: Runner shell — `scripts/migrate-fuel-data.ts`

A thin runner: read the snapshot, parse it, and (real run) load it via `migrateFuelAllocations`. `--dry-run` validates parsing and prints counts with no DB connection — which is also this task's smoke test (and confirms `npx tsx` works).

**Files:**
- Create: `scripts/migrate-fuel-data.ts`

**Interfaces:**
- Consumes: `parseFuelDump`, `migrateFuelAllocations` from `../lib/fuel/migrate` (relative); `../lib/prisma` (relative, real run only, for `$disconnect`); env `DATABASE_URL` (target, real run only) and `FUEL_DUMP_JSON` (optional snapshot path override).
- Produces: a runnable CLI (`--dry-run` | real).

- [ ] **Step 1: Write the script**

Create `scripts/migrate-fuel-data.ts`:

```ts
/**
 * Load a fuel_allocations snapshot into subfrost.io's FuelAllocation. Parse/load
 * logic lives in ../lib/fuel/migrate (unit-tested); this is the thin runnable shell.
 *
 * Usage (run from the repo root):
 *   # validate the snapshot without touching any DB (no DATABASE_URL needed):
 *   npx tsx scripts/migrate-fuel-data.ts --dry-run
 *
 *   # real load (DATABASE_URL = subfrost.io target DB, via the io cloud-sql-proxy):
 *   npx tsx scripts/migrate-fuel-data.ts
 *
 *   # custom snapshot path:
 *   npx tsx scripts/migrate-fuel-data.ts <snapshot.json>
 *
 * Idempotent: upserts by address (source wins). Safe to re-run.
 */
import { readFileSync } from "fs"
import { parseFuelDump, migrateFuelAllocations } from "../lib/fuel/migrate"

const DEFAULT_DUMP = "../.bestary-extracted/dump/fuel_allocations.json"

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const dumpPath = args.filter((a) => !a.startsWith("--"))[0] ?? process.env.FUEL_DUMP_JSON ?? DEFAULT_DUMP

  console.log(`Reading FUEL snapshot ← ${dumpPath}`)
  const entries = parseFuelDump(readFileSync(dumpPath, "utf-8"))
  const totalAmount = entries.reduce((s, e) => s + e.amount, 0)
  console.log(`\nParsed: ${entries.length} allocations, total amount = ${totalAmount}`)
  console.log("Sample:", entries.slice(0, 3))

  if (dryRun) {
    console.log("\n[dry-run] parsed cleanly; no database writes performed.")
    return
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for a real load (use --dry-run to validate only).")
  }

  const { prisma } = await import("../lib/prisma")
  try {
    console.log("\nWriting to DATABASE_URL…")
    const res = await migrateFuelAllocations(entries)
    console.log(`\nDone: upserted ${res.total} allocations in ${res.chunks} chunk(s).`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Smoke-test the dry-run against a fixture (also confirms `npx tsx`)**

Create a temp fixture and run the dry-run (bash):

```bash
printf '[{"id":"1","address":"addrA","amount":10,"note":"x"},{"id":"2","address":"addrB","amount":5.5}]' > /tmp/fuel-fixture.json
npx tsx scripts/migrate-fuel-data.ts --dry-run /tmp/fuel-fixture.json
```

Expected output includes: `Parsed: 2 allocations, total amount = 15.5` and `[dry-run] parsed cleanly; no database writes performed.` (no DB connection attempted).

If `npx tsx` is unavailable/offline, report it (BLOCKED) — the fallback is compiling the script or shipping a `.mjs`; do not skip this verification.

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-fuel-data.ts
git commit -m "feat(fuel): snapshot load runner (--dry-run + real)"
```

---

## Post-implementation (out of the per-task loop)

- Full verification before PR: `node_modules/.bin/tsc --noEmit` → 0; `CI=true node_modules/.bin/vitest run` → green (new `tests/fuel/migrate.test.ts` + existing suite); `node_modules/.bin/next build` → 0.
- Open the PR: `feat/fuel-import` → `main` (branch → PR → merge). **No image bump / Flux** — no running app code changes; the live `/admin/fuel` will show the imported rows once the load runs.
- **Operational data load** (after merge; manual, sequential — one proxy at a time):
  1. Start cloud-sql-proxy for the source: `.ioenv-check/cloud-sql-proxy.exe --credentials-file .bestary-extracted/.config/gcloud-bestary/bestary-sa.json --port 5434 lithomantic-heaven-bestary:us-central1:subfrost-db`; set `FUEL_SOURCE_DATABASE_URL` to the proxied URL; `npx tsx scripts/dump-fuel-allocations.ts`. Inspect the snapshot count/total.
  2. `npx tsx scripts/migrate-fuel-data.ts --dry-run` → confirm parsed count/total match the snapshot.
  3. Start cloud-sql-proxy for the target (io) and set `DATABASE_URL` from the `db-connection-string-k8s` secret (via `kubectl-io.sh get secret`); `npx tsx scripts/migrate-fuel-data.ts` → load.
  4. Spot-check live: `/admin/fuel` shows the allocations; total matches the dump.
