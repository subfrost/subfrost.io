# Marketing — Protocol Snapshot (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Marketing section to `/admin` whose first feature captures durable, on-demand snapshots of protocol + token metrics (incl. DIESEL/FIRE/frBTC holder counts) and compares any two (or one vs. live).

**Architecture:** One `MarketingSnapshot` Postgres row per capture with a JSON `payload`. Capture fetches per-token data live from the public `get-alkane-details` endpoint and reuses the durable home-stats store (`getStats()`) for slow-moving protocol fields. A new `marketing.view` privilege gates a Marketing nav group with list/detail/compare pages.

**Tech Stack:** Next.js 16 App Router (RSC + client islands), Prisma/Postgres, zod v3, vitest (happy-dom), Tailwind. Spec: `docs/superpowers/specs/2026-06-24-marketing-protocol-snapshot-design.md`.

## Global Constraints

- Branch → PR → merge. Never push to `main`. Never `git add .claude/` or `.npmrc`.
- `import prisma from "@/lib/prisma"` (default import). Test mock: `vi.mock("@/lib/prisma", () => ({ prisma: client, default: client }))`.
- zod **v3**. `@/` path alias. vitest happy-dom.
- Schema changes are **additive only** — applied in prod by the `migrate` init container (`prisma db push`). Local type gate: `npx prisma generate`.
- Every captured numeric field is nullable and guarded — a failed/malformed source yields `null`, never throws.
- Mainnet token ids (verified live 2026-06-24): DIESEL `2:0`, FIRE `2:77623`, frBTC `32:0`.
- Gates before every commit that touches code: `npx tsc --noEmit` (0), `CI=true npx vitest run` (green).
- Privileges live in `lib/cms/iam/registry.ts`; effective privileges are read off `currentUser().privileges` (already expanded). `marketing.view` is NOT restricted (ADMIN auto-gets).

---

### Task 1: Schema — `MarketingSnapshot` model

**Files:**
- Modify: `prisma/schema.prisma` (User model ~286, Article model ~378, append new model after `AuthorSubscription`)

**Interfaces:**
- Produces: Prisma model `MarketingSnapshot { id, createdAt, createdById, label, context, refUrl, articleId, note, payload }`; relations `User.marketingSnapshots`, `Article.marketingSnapshots`.

- [ ] **Step 1: Add the back-relation to `User`**

In `model User`, alongside the other relation fields (after `authorFollowers ... @relation("AuthorFollowers")`):

```prisma
  marketingSnapshots MarketingSnapshot[] @relation("SnapshotCreator")
```

- [ ] **Step 2: Add the back-relation to `Article`**

In `model Article`, after `revisions Revision[]`:

```prisma
  marketingSnapshots MarketingSnapshot[]
```

- [ ] **Step 3: Append the new model** (after `model AuthorSubscription { ... }`)

```prisma
// Point-in-time capture of protocol + token marketing metrics. payload holds the
// full SnapshotPayload (lib/marketing/types.ts); opaque JSON so new metrics need
// no migration. Captured on demand from /admin/marketing/snapshots.
model MarketingSnapshot {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  createdById String?
  createdBy   User?    @relation("SnapshotCreator", fields: [createdById], references: [id], onDelete: SetNull)
  label       String
  context     String   @default("GENERAL") // GENERAL | X_POST | ARTICLE
  refUrl      String?
  articleId   String?
  article     Article? @relation(fields: [articleId], references: [id], onDelete: SetNull)
  note        String?
  payload     Json

  @@index([createdAt])
}
```

- [ ] **Step 4: Regenerate the client and typecheck**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: prisma generates without error; tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(marketing): add MarketingSnapshot model"
```

---

### Task 2: IAM — `marketing` category, `marketing.view` privilege, view gate

**Files:**
- Modify: `lib/cms/iam/registry.ts`
- Test: `tests/cms/iam-registry.test.ts`

**Interfaces:**
- Produces: privilege code `"marketing.view"` (category `"marketing"`); `VIEW_GATES["/admin/marketing/snapshots"] = { view: "marketing.view" }`.

- [ ] **Step 1: Write the failing test** (append to `tests/cms/iam-registry.test.ts`)

```ts
import { ALL_CODES, CATEGORIES, VIEW_GATES, expand } from "@/lib/cms/iam/registry"

describe("marketing privilege", () => {
  it("registers marketing.view in the marketing category", () => {
    expect(ALL_CODES).toContain("marketing.view")
    expect(CATEGORIES.some((c) => c.key === "marketing")).toBe(true)
  })
  it("expands to itself (no implied deps) and gates the snapshots route", () => {
    expect(expand(["marketing.view"])).toEqual(["marketing.view"])
    expect(VIEW_GATES["/admin/marketing/snapshots"]).toEqual({ view: "marketing.view" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/cms/iam-registry.test.ts`
Expected: FAIL — `ALL_CODES` does not contain `marketing.view`.

- [ ] **Step 3: Implement**

In `lib/cms/iam/registry.ts`:

1. Add to the `CategoryKey` union (after `"financials"`): `| "marketing"`.
2. Add to `CATEGORIES` (after the financials entry): `{ key: "marketing", label: "Marketing" },`
3. Add to `PRIVILEGES` (a new section before `// --- API keys ---`):

```ts
  // --- Marketing ---
  { code: "marketing.view", label: "Marketing — view", description: "View and capture protocol marketing snapshots.", category: "marketing", implies: [] },
```

4. Add to `VIEW_GATES` (after the financials entries):

```ts
  "/admin/marketing/snapshots": { view: "marketing.view" },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx vitest run tests/cms/iam-registry.test.ts`
Expected: PASS. (ADMIN auto-gets it because it is not in `RESTRICTED_PRIVILEGES`.)

- [ ] **Step 5: Commit**

```bash
git add lib/cms/iam/registry.ts tests/cms/iam-registry.test.ts
git commit -m "feat(marketing): marketing.view privilege + view gate"
```

---

### Task 3: Types + `get-alkane-details` client

**Files:**
- Create: `lib/marketing/types.ts`
- Create: `lib/marketing/alkane-details.ts`
- Test: `tests/marketing/alkane-details.test.ts`

**Interfaces:**
- Produces:
  - `SnapshotContext = "GENERAL" | "X_POST" | "ARTICLE"`
  - `interface SnapshotTokenBlock { id; name; symbol; holders; priceUsd; supply; marketcapUsd; fdvUsd; volume24hUsd; priceChange24h; priceChange7d; priceChange30d }` (every field except `id` is `T | null`)
  - `interface SnapshotPayload { capturedAt: string; protocol; tokens: { diesel; fire; frbtc }; ratios; partial: boolean }` (full shape per spec)
  - constants `DIESEL_ID = "2:0"`, `FIRE_ID = "2:77623"`, `FRBTC_ID = "32:0"`
  - `getAlkaneDetails(id: string, fetchImpl?: typeof fetch): Promise<SnapshotTokenBlock>`

- [ ] **Step 1: Create the types file** `lib/marketing/types.ts`

```ts
export type SnapshotContext = "GENERAL" | "X_POST" | "ARTICLE"
export const SNAPSHOT_CONTEXTS: SnapshotContext[] = ["GENERAL", "X_POST", "ARTICLE"]

export const DIESEL_ID = "2:0"
export const FIRE_ID = "2:77623"
export const FRBTC_ID = "32:0"

export interface SnapshotTokenBlock {
  id: string
  name: string | null
  symbol: string | null
  holders: number | null
  priceUsd: number | null
  supply: string | null
  marketcapUsd: number | null
  fdvUsd: number | null
  volume24hUsd: number | null
  priceChange24h: number | null
  priceChange7d: number | null
  priceChange30d: number | null
}

export interface SnapshotProtocol {
  totalBtcLocked: number | null
  alkanesBtcLocked: number | null
  brc20BtcLocked: number | null
  btcUsd: number | null
  btcHeight: number | null
  metashrewHeight: number | null
  source: "store"
}

export interface SnapshotPayload {
  capturedAt: string
  protocol: SnapshotProtocol
  tokens: { diesel: SnapshotTokenBlock; fire: SnapshotTokenBlock; frbtc: SnapshotTokenBlock }
  ratios: { btcDiesel: number | null; btcFire: number | null }
  partial: boolean
}
```

- [ ] **Step 2: Write the failing test** `tests/marketing/alkane-details.test.ts`

```ts
import { describe, it, expect, vi } from "vitest"
import { getAlkaneDetails } from "@/lib/marketing/alkane-details"

const ok = (data: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data, statusCode: 200 }) }) as unknown as typeof fetch

describe("getAlkaneDetails", () => {
  it("maps the rich response to a typed token block", async () => {
    const f = ok({
      name: "DIESEL", symbol: "DIESEL", holders: 7891, priceUsd: 67.45,
      supply: "65712934154469", marketcap: 4.4e9, fdvUsd: 4.5e9,
      tokenVolume1d: 123456, priceChange24h: 1.2, priceChange7d: -3.4, priceChange30d: 10,
    })
    const b = await getAlkaneDetails("2:0", f)
    expect(b).toEqual({
      id: "2:0", name: "DIESEL", symbol: "DIESEL", holders: 7891, priceUsd: 67.45,
      supply: "65712934154469", marketcapUsd: 4.4e9, fdvUsd: 4.5e9,
      volume24hUsd: 123456, priceChange24h: 1.2, priceChange7d: -3.4, priceChange30d: 10,
    })
  })

  it("yields an all-null block (never throws) on HTTP error", async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch
    const b = await getAlkaneDetails("2:77623", f)
    expect(b.id).toBe("2:77623")
    expect(b.holders).toBeNull()
    expect(b.priceUsd).toBeNull()
    expect(b.name).toBeNull()
  })

  it("yields nulls for missing/malformed fields", async () => {
    const f = ok({ name: "FIRE", holders: "oops", priceUsd: 53.7 })
    const b = await getAlkaneDetails("2:77623", f)
    expect(b.name).toBe("FIRE")
    expect(b.holders).toBeNull()      // malformed
    expect(b.priceUsd).toBe(53.7)
    expect(b.supply).toBeNull()       // missing
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `CI=true npx vitest run tests/marketing/alkane-details.test.ts`
Expected: FAIL — cannot find module `@/lib/marketing/alkane-details`.

- [ ] **Step 4: Implement** `lib/marketing/alkane-details.ts`

```ts
/**
 * Per-token marketing data from the canon Espo `get-alkane-details` endpoint
 * (oyl.alkanode.com, public, no auth). Returns a guarded SnapshotTokenBlock —
 * every field nulls out on failure; never throws.
 */
import type { SnapshotTokenBlock } from "@/lib/marketing/types"

const DETAILS_URL = process.env.ESPO_DETAILS_URL || "https://oyl.alkanode.com"

const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v ? v : (typeof v === "number" ? String(v) : null)

function nullBlock(id: string): SnapshotTokenBlock {
  return {
    id, name: null, symbol: null, holders: null, priceUsd: null, supply: null,
    marketcapUsd: null, fdvUsd: null, volume24hUsd: null,
    priceChange24h: null, priceChange7d: null, priceChange30d: null,
  }
}

export async function getAlkaneDetails(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SnapshotTokenBlock> {
  try {
    const [block, tx] = id.split(":")
    const res = await fetchImpl(`${DETAILS_URL}/get-alkane-details`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alkaneId: { block, tx } }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return nullBlock(id)
    const json = (await res.json()) as { data?: Record<string, unknown> }
    const d = json.data
    if (!d || typeof d !== "object") return nullBlock(id)
    return {
      id,
      name: typeof d.name === "string" ? d.name : null,
      symbol: typeof d.symbol === "string" ? d.symbol : null,
      holders: numOrNull(d.holders),
      priceUsd: numOrNull(d.priceUsd),
      supply: strOrNull(d.supply),
      marketcapUsd: numOrNull(d.marketcap),
      fdvUsd: numOrNull(d.fdvUsd),
      volume24hUsd: numOrNull(d.tokenVolume1d),
      priceChange24h: numOrNull(d.priceChange24h),
      priceChange7d: numOrNull(d.priceChange7d),
      priceChange30d: numOrNull(d.priceChange30d),
    }
  } catch {
    return nullBlock(id)
  }
}
```

> Note: `marketcap` is mapped to `marketcapUsd`. The live response (verified 2026-06-24)
> exposes `marketcap` alongside `busdPoolMarketcapInUsd`/`frbtcPoolMarketcapInSats`; if a
> future check shows plain `marketcap` is not USD, adjust the source key here and the
> fixture in Step 2 — the type stays the same.

- [ ] **Step 5: Run test to verify it passes**

Run: `CI=true npx vitest run tests/marketing/alkane-details.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/marketing/types.ts lib/marketing/alkane-details.ts tests/marketing/alkane-details.test.ts
git commit -m "feat(marketing): types + get-alkane-details client"
```

---

### Task 4: Snapshot assembler

**Files:**
- Create: `lib/marketing/snapshot.ts`
- Test: `tests/marketing/snapshot.test.ts`

**Interfaces:**
- Consumes: `getAlkaneDetails` (Task 3), `getStats` from `@/lib/stats`, the id constants.
- Produces: `captureSnapshot(): Promise<SnapshotPayload>`.

- [ ] **Step 1: Write the failing test** `tests/marketing/snapshot.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/marketing/alkane-details", () => ({ getAlkaneDetails: vi.fn() }))
vi.mock("@/lib/stats", () => ({ getStats: vi.fn() }))

import { captureSnapshot } from "@/lib/marketing/snapshot"
import { getAlkaneDetails } from "@/lib/marketing/alkane-details"
import { getStats } from "@/lib/stats"
import type { SnapshotTokenBlock } from "@/lib/marketing/types"

const block = (id: string, over: Partial<SnapshotTokenBlock> = {}): SnapshotTokenBlock => ({
  id, name: id, symbol: id, holders: 1, priceUsd: 1, supply: "1", marketcapUsd: 1,
  fdvUsd: 1, volume24hUsd: 1, priceChange24h: 0, priceChange7d: 0, priceChange30d: 0, ...over,
})

beforeEach(() => vi.clearAllMocks())

it("assembles protocol (from getStats) + 3 token blocks + ratios", async () => {
  vi.mocked(getStats).mockResolvedValue({
    metrics: { alkanesBtcLocked: 99.6, brc20BtcLocked: 1, alkanesBtcLockedAddress: null, brc20BtcLockedAddress: null, alkanesCirculating: null, brc20Circulating: null, alkanesTotalUnwraps: null, brc20TotalUnwraps: null, btcPrice: 62000 },
    marquee: { btcUsd: 62000, btcHeight: 955109, metashrewHeight: 955108, dieselUsd: 70, fireUsd: 55, btcDieselRatio: 885, btcFireRatio: 1127 },
  })
  vi.mocked(getAlkaneDetails)
    .mockImplementation(async (id: string) => block(id, { holders: id === "2:0" ? 7891 : 955 }))

  const p = await captureSnapshot()
  expect(p.protocol.totalBtcLocked).toBe(100.6)
  expect(p.protocol.btcUsd).toBe(62000)
  expect(p.ratios).toEqual({ btcDiesel: 885, btcFire: 1127 })
  expect(p.tokens.diesel.holders).toBe(7891)
  expect(p.tokens.fire.holders).toBe(955)
  expect(p.tokens.frbtc.id).toBe("32:0")
  expect(p.partial).toBe(false)
  expect(typeof p.capturedAt).toBe("string")
})

it("totalBtcLocked is null and partial true when a token block is all-null", async () => {
  vi.mocked(getStats).mockResolvedValue({
    metrics: { alkanesBtcLocked: null, brc20BtcLocked: 1, alkanesBtcLockedAddress: null, brc20BtcLockedAddress: null, alkanesCirculating: null, brc20Circulating: null, alkanesTotalUnwraps: null, brc20TotalUnwraps: null, btcPrice: null },
    marquee: { btcUsd: null, btcHeight: null, metashrewHeight: null, dieselUsd: null, fireUsd: null, btcDieselRatio: null, btcFireRatio: null },
  })
  vi.mocked(getAlkaneDetails).mockImplementation(async (id: string) =>
    id === "2:0" ? block(id, { holders: null, priceUsd: null, name: null }) : block(id))

  const p = await captureSnapshot()
  expect(p.protocol.totalBtcLocked).toBeNull() // alkanes null
  expect(p.partial).toBe(true)                 // diesel block has nulls
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/marketing/snapshot.test.ts`
Expected: FAIL — cannot find module `@/lib/marketing/snapshot`.

- [ ] **Step 3: Implement** `lib/marketing/snapshot.ts`

```ts
/**
 * Assemble a SnapshotPayload: per-token data live from get-alkane-details (in
 * parallel) + protocol/ratios reused from the durable home-stats store via
 * getStats(). Never throws — missing data nulls out and flips `partial`.
 */
import { getStats } from "@/lib/stats"
import { getAlkaneDetails } from "@/lib/marketing/alkane-details"
import { DIESEL_ID, FIRE_ID, FRBTC_ID, type SnapshotPayload, type SnapshotTokenBlock } from "@/lib/marketing/types"

const sum = (a: number | null, b: number | null): number | null =>
  a !== null && b !== null ? a + b : null

const blockComplete = (b: SnapshotTokenBlock): boolean =>
  b.holders !== null && b.priceUsd !== null && b.supply !== null

export async function captureSnapshot(): Promise<SnapshotPayload> {
  const [stats, diesel, fire, frbtc] = await Promise.all([
    getStats(),
    getAlkaneDetails(DIESEL_ID),
    getAlkaneDetails(FIRE_ID),
    getAlkaneDetails(FRBTC_ID),
  ])

  const protocol = {
    totalBtcLocked: sum(stats.metrics.alkanesBtcLocked, stats.metrics.brc20BtcLocked),
    alkanesBtcLocked: stats.metrics.alkanesBtcLocked,
    brc20BtcLocked: stats.metrics.brc20BtcLocked,
    btcUsd: stats.marquee.btcUsd,
    btcHeight: stats.marquee.btcHeight,
    metashrewHeight: stats.marquee.metashrewHeight,
    source: "store" as const,
  }

  const tokens = { diesel, fire, frbtc }
  const partial =
    Object.values(protocol).some((v) => v === null) ||
    !blockComplete(diesel) || !blockComplete(fire) || !blockComplete(frbtc)

  return {
    capturedAt: new Date().toISOString(),
    protocol,
    tokens,
    ratios: { btcDiesel: stats.marquee.btcDieselRatio, btcFire: stats.marquee.btcFireRatio },
    partial,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx vitest run tests/marketing/snapshot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/marketing/snapshot.ts tests/marketing/snapshot.test.ts
git commit -m "feat(marketing): snapshot assembler"
```

---

### Task 5: Pure diff helper

**Files:**
- Create: `lib/marketing/diff.ts`
- Test: `tests/marketing/diff.test.ts`

**Interfaces:**
- Consumes: `SnapshotPayload`.
- Produces: `diffSnapshots(before: SnapshotPayload, after: SnapshotPayload): DiffRow[]` where `interface DiffRow { path: string; label: string; before: number | null; after: number | null; deltaAbs: number | null; deltaPct: number | null }`.

- [ ] **Step 1: Write the failing test** `tests/marketing/diff.test.ts`

```ts
import { describe, it, expect } from "vitest"
import { diffSnapshots } from "@/lib/marketing/diff"
import type { SnapshotPayload, SnapshotTokenBlock } from "@/lib/marketing/types"

const tb = (over: Partial<SnapshotTokenBlock>): SnapshotTokenBlock => ({
  id: "2:0", name: "X", symbol: "X", holders: null, priceUsd: null, supply: null,
  marketcapUsd: null, fdvUsd: null, volume24hUsd: null,
  priceChange24h: null, priceChange7d: null, priceChange30d: null, ...over,
})
const pay = (dieselHolders: number | null, btcLocked: number | null): SnapshotPayload => ({
  capturedAt: "t", partial: false,
  protocol: { totalBtcLocked: btcLocked, alkanesBtcLocked: null, brc20BtcLocked: null, btcUsd: null, btcHeight: null, metashrewHeight: null, source: "store" },
  tokens: { diesel: tb({ holders: dieselHolders }), fire: tb({}), frbtc: tb({}) },
  ratios: { btcDiesel: null, btcFire: null },
})

it("computes absolute and percentage deltas", () => {
  const rows = diffSnapshots(pay(100, 50), pay(150, 60))
  const holders = rows.find((r) => r.path === "tokens.diesel.holders")!
  expect(holders.deltaAbs).toBe(50)
  expect(holders.deltaPct).toBeCloseTo(50, 6) // (150-100)/100*100
})

it("is null-safe and avoids divide-by-zero", () => {
  const rows = diffSnapshots(pay(null, 0), pay(10, 5))
  const holders = rows.find((r) => r.path === "tokens.diesel.holders")!
  expect(holders.deltaAbs).toBeNull()  // before null
  expect(holders.deltaPct).toBeNull()
  const locked = rows.find((r) => r.path === "protocol.totalBtcLocked")!
  expect(locked.deltaAbs).toBe(5)
  expect(locked.deltaPct).toBeNull()   // before 0 → no %
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/marketing/diff.test.ts`
Expected: FAIL — cannot find module `@/lib/marketing/diff`.

- [ ] **Step 3: Implement** `lib/marketing/diff.ts`

```ts
import type { SnapshotPayload } from "@/lib/marketing/types"

export interface DiffRow {
  path: string
  label: string
  before: number | null
  after: number | null
  deltaAbs: number | null
  deltaPct: number | null
}

type Field = { path: string; label: string; get: (p: SnapshotPayload) => number | null }

const TOKENS: Array<["diesel" | "fire" | "frbtc", string]> = [
  ["diesel", "DIESEL"], ["fire", "FIRE"], ["frbtc", "frBTC"],
]
const TOKEN_FIELDS: Array<[keyof SnapshotPayload["tokens"]["diesel"], string]> = [
  ["holders", "holders"], ["priceUsd", "price USD"], ["marketcapUsd", "market cap USD"],
  ["fdvUsd", "FDV USD"], ["volume24hUsd", "24h volume USD"],
  ["priceChange24h", "24h change %"], ["priceChange7d", "7d change %"], ["priceChange30d", "30d change %"],
]

const FIELDS: Field[] = [
  { path: "protocol.totalBtcLocked", label: "Total BTC Locked", get: (p) => p.protocol.totalBtcLocked },
  { path: "protocol.btcUsd", label: "BTC price USD", get: (p) => p.protocol.btcUsd },
  { path: "ratios.btcDiesel", label: "BTC/DIESEL", get: (p) => p.ratios.btcDiesel },
  { path: "ratios.btcFire", label: "BTC/FIRE", get: (p) => p.ratios.btcFire },
  ...TOKENS.flatMap(([key, name]) =>
    TOKEN_FIELDS.map(([f, fl]): Field => ({
      path: `tokens.${key}.${f}`,
      label: `${name} ${fl}`,
      get: (p) => p.tokens[key][f] as number | null,
    })),
  ),
]

export function diffSnapshots(before: SnapshotPayload, after: SnapshotPayload): DiffRow[] {
  return FIELDS.map(({ path, label, get }) => {
    const b = get(before)
    const a = get(after)
    const deltaAbs = b !== null && a !== null ? a - b : null
    const deltaPct = b !== null && a !== null && b !== 0 ? ((a - b) / b) * 100 : null
    return { path, label, before: b, after: a, deltaAbs, deltaPct }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx vitest run tests/marketing/diff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/marketing/diff.ts tests/marketing/diff.test.ts
git commit -m "feat(marketing): pure snapshot diff helper"
```

---

### Task 6: Snapshot store (Prisma CRUD)

**Files:**
- Create: `lib/marketing/snapshot-store.ts`
- Test: `tests/marketing/snapshot-store.test.ts`

**Interfaces:**
- Consumes: `SnapshotPayload`, `SnapshotContext`.
- Produces:
  - `interface SnapshotRow { id; createdAt; label; context; refUrl; articleId; note; createdByName; articleSlug; payload }`
  - `createSnapshot(input: { label; context; refUrl; articleId; note }, payload: SnapshotPayload, createdById: string | null): Promise<SnapshotRow>`
  - `listSnapshots(): Promise<SnapshotRow[]>`
  - `getSnapshot(id: string): Promise<SnapshotRow | null>`
  - `deleteSnapshot(id: string): Promise<void>`
  - `class MarketingError extends Error`

- [ ] **Step 1: Write the failing test** `tests/marketing/snapshot-store.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const client = {
  marketingSnapshot: {
    create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn(),
  },
}
vi.mock("@/lib/prisma", () => ({ prisma: client, default: client }))

import { createSnapshot, listSnapshots, MarketingError } from "@/lib/marketing/snapshot-store"
import type { SnapshotPayload } from "@/lib/marketing/types"

const payload = { capturedAt: "t", partial: false, protocol: {} as never, tokens: {} as never, ratios: {} as never } as SnapshotPayload

beforeEach(() => vi.clearAllMocks())

it("rejects an empty label", async () => {
  await expect(createSnapshot({ label: "  ", context: "GENERAL", refUrl: null, articleId: null, note: null }, payload, "u1"))
    .rejects.toBeInstanceOf(MarketingError)
})

it("creates a row and maps creator/article names", async () => {
  client.marketingSnapshot.create.mockResolvedValue({
    id: "s1", createdAt: new Date("2026-06-24"), label: "before X", context: "X_POST",
    refUrl: "https://x.com/p", articleId: null, note: null, payload,
    createdBy: { name: "Vitor" }, article: null,
  })
  const row = await createSnapshot({ label: "before X", context: "X_POST", refUrl: "https://x.com/p", articleId: null, note: null }, payload, "u1")
  expect(row.id).toBe("s1")
  expect(row.context).toBe("X_POST")
  expect(row.createdByName).toBe("Vitor")
  expect(client.marketingSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ label: "before X", createdById: "u1" }),
  }))
})

it("lists snapshots newest-first", async () => {
  client.marketingSnapshot.findMany.mockResolvedValue([])
  await listSnapshots()
  expect(client.marketingSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({
    orderBy: { createdAt: "desc" },
  }))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/marketing/snapshot-store.test.ts`
Expected: FAIL — cannot find module `@/lib/marketing/snapshot-store`.

- [ ] **Step 3: Implement** `lib/marketing/snapshot-store.ts`

```ts
import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { SnapshotContext, SnapshotPayload } from "@/lib/marketing/types"

export class MarketingError extends Error {}

export interface SnapshotRow {
  id: string
  createdAt: Date
  label: string
  context: SnapshotContext
  refUrl: string | null
  articleId: string | null
  note: string | null
  createdByName: string | null
  articleSlug: string | null
  payload: SnapshotPayload
}

type DbRow = {
  id: string; createdAt: Date; label: string; context: string; refUrl: string | null
  articleId: string | null; note: string | null; payload: unknown
  createdBy: { name: string | null } | null; article: { slug: string } | null
}

const INCLUDE = { createdBy: { select: { name: true } }, article: { select: { slug: true } } }

function map(r: DbRow): SnapshotRow {
  return {
    id: r.id, createdAt: r.createdAt, label: r.label, context: r.context as SnapshotContext,
    refUrl: r.refUrl, articleId: r.articleId, note: r.note,
    createdByName: r.createdBy?.name ?? null, articleSlug: r.article?.slug ?? null,
    payload: r.payload as SnapshotPayload,
  }
}

export async function createSnapshot(
  input: { label: string; context: SnapshotContext; refUrl: string | null; articleId: string | null; note: string | null },
  payload: SnapshotPayload,
  createdById: string | null,
): Promise<SnapshotRow> {
  const label = input.label.trim()
  if (!label) throw new MarketingError("A label is required")
  const r = (await prisma.marketingSnapshot.create({
    data: {
      label,
      context: input.context,
      refUrl: input.refUrl?.trim() || null,
      articleId: input.articleId || null,
      note: input.note?.trim() || null,
      createdById,
      payload: payload as unknown as Prisma.InputJsonValue,
    },
    include: INCLUDE,
  })) as DbRow
  return map(r)
}

export async function listSnapshots(): Promise<SnapshotRow[]> {
  const rows = (await prisma.marketingSnapshot.findMany({
    orderBy: { createdAt: "desc" }, include: INCLUDE,
  })) as DbRow[]
  return rows.map(map)
}

export async function getSnapshot(id: string): Promise<SnapshotRow | null> {
  const r = (await prisma.marketingSnapshot.findUnique({ where: { id }, include: INCLUDE })) as DbRow | null
  return r ? map(r) : null
}

export async function deleteSnapshot(id: string): Promise<void> {
  await prisma.marketingSnapshot.delete({ where: { id } })
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `CI=true npx vitest run tests/marketing/snapshot-store.test.ts && npx tsc --noEmit`
Expected: PASS, tsc 0.

- [ ] **Step 5: Commit**

```bash
git add lib/marketing/snapshot-store.ts tests/marketing/snapshot-store.test.ts
git commit -m "feat(marketing): snapshot store (prisma CRUD)"
```

---

### Task 7: Server actions

**Files:**
- Create: `actions/marketing/snapshots.ts`
- Test: `tests/marketing/snapshots-action.test.ts`

**Interfaces:**
- Consumes: `captureSnapshot` (Task 4), `createSnapshot`/`deleteSnapshot` (Task 6), `currentUser` from `@/lib/cms/authz`, `audit` from `@/lib/cms/audit`.
- Produces:
  - `captureSnapshotAction(input): Promise<{ ok: true; value: SnapshotRow } | { ok: false; error: string }>`
  - `deleteSnapshotAction(id): Promise<{ ok: true } | { ok: false; error: string }>`
  - `liveSnapshotAction(): Promise<{ ok: true; value: SnapshotPayload } | { ok: false; error: string }>`

- [ ] **Step 1: Write the failing test** `tests/marketing/snapshots-action.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/lib/cms/audit", () => ({ audit: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }))
vi.mock("@/lib/marketing/snapshot", () => ({ captureSnapshot: vi.fn() }))
vi.mock("@/lib/marketing/snapshot-store", () => ({ createSnapshot: vi.fn(), deleteSnapshot: vi.fn() }))

import { captureSnapshotAction, liveSnapshotAction } from "@/actions/marketing/snapshots"
import { currentUser } from "@/lib/cms/authz"
import { captureSnapshot } from "@/lib/marketing/snapshot"
import { createSnapshot } from "@/lib/marketing/snapshot-store"

const payload = { capturedAt: "t", partial: false } as never
beforeEach(() => vi.clearAllMocks())

it("rejects when the user lacks marketing.view", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: [] } as never)
  const r = await captureSnapshotAction({ label: "x", context: "GENERAL" })
  expect(r).toEqual({ ok: false, error: "unauthorized" })
  expect(createSnapshot).not.toHaveBeenCalled()
})

it("captures + persists for an authorized user", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["marketing.view"] } as never)
  vi.mocked(captureSnapshot).mockResolvedValue(payload)
  vi.mocked(createSnapshot).mockResolvedValue({ id: "s1" } as never)
  const r = await captureSnapshotAction({ label: "before X", context: "X_POST", refUrl: "https://x.com/p" })
  expect(r).toEqual({ ok: true, value: { id: "s1" } })
  expect(createSnapshot).toHaveBeenCalledWith(
    { label: "before X", context: "X_POST", refUrl: "https://x.com/p", articleId: null, note: null },
    payload, "u1",
  )
})

it("liveSnapshotAction returns the payload without persisting", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["marketing.view"] } as never)
  vi.mocked(captureSnapshot).mockResolvedValue(payload)
  const r = await liveSnapshotAction()
  expect(r).toEqual({ ok: true, value: payload })
  expect(createSnapshot).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/marketing/snapshots-action.test.ts`
Expected: FAIL — cannot find module `@/actions/marketing/snapshots`.

- [ ] **Step 3: Implement** `actions/marketing/snapshots.ts`

```ts
"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import { captureSnapshot } from "@/lib/marketing/snapshot"
import { createSnapshot, deleteSnapshot, MarketingError, type SnapshotRow } from "@/lib/marketing/snapshot-store"
import { SNAPSHOT_CONTEXTS, type SnapshotPayload } from "@/lib/marketing/types"

const PATH = "/admin/marketing/snapshots"
const PRIV = "marketing.view"

const InputSchema = z.object({
  label: z.string().min(1, "A label is required"),
  context: z.enum(["GENERAL", "X_POST", "ARTICLE"]).default("GENERAL"),
  refUrl: z.string().url().optional().or(z.literal("")),
  articleId: z.string().optional(),
  note: z.string().optional(),
})
export type CaptureInput = z.input<typeof InputSchema>

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

async function gate(): Promise<{ ok: true; me: CmsUser } | { ok: false; error: "unauthorized" }> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(PRIV)) return { ok: false, error: "unauthorized" }
  return { ok: true, me }
}

export async function captureSnapshotAction(
  input: CaptureInput,
): Promise<{ ok: true; value: SnapshotRow } | { ok: false; error: string }> {
  const g = await gate()
  if (!g.ok) return g
  const parsed = InputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  try {
    const payload = await captureSnapshot()
    const value = await createSnapshot(
      {
        label: parsed.data.label,
        context: parsed.data.context,
        refUrl: parsed.data.refUrl ? parsed.data.refUrl : null,
        articleId: parsed.data.articleId || null,
        note: parsed.data.note || null,
      },
      payload,
      g.me.id,
    )
    await audit("marketing_snapshot_create", { actorId: g.me.id, target: value.id, ip: await ip() })
    revalidatePath(PATH)
    return { ok: true, value }
  } catch (e) {
    if (e instanceof MarketingError) return { ok: false, error: e.message }
    throw e
  }
}

export async function deleteSnapshotAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate()
  if (!g.ok) return g
  await deleteSnapshot(id)
  await audit("marketing_snapshot_delete", { actorId: g.me.id, target: id, ip: await ip() })
  revalidatePath(PATH)
  return { ok: true }
}

export async function liveSnapshotAction(): Promise<{ ok: true; value: SnapshotPayload } | { ok: false; error: string }> {
  const g = await gate()
  if (!g.ok) return g
  return { ok: true, value: await captureSnapshot() }
}

void SNAPSHOT_CONTEXTS
```

> Note: the `InputSchema` enum mirrors `SNAPSHOT_CONTEXTS`; the trailing `void SNAPSHOT_CONTEXTS`
> documents the shared source and avoids an unused-import lint. If your lint forbids that, drop
> the import and the `void` line.

- [ ] **Step 4: Run test + typecheck**

Run: `CI=true npx vitest run tests/marketing/snapshots-action.test.ts && npx tsc --noEmit`
Expected: PASS, tsc 0.

- [ ] **Step 5: Commit**

```bash
git add actions/marketing/snapshots.ts tests/marketing/snapshots-action.test.ts
git commit -m "feat(marketing): snapshot server actions (capture/delete/live)"
```

---

### Task 8: Marketing nav group

**Files:**
- Modify: `lib/cms/admin-nav.ts`
- Test: `tests/cms/marketing-nav.test.ts`

**Interfaces:**
- Consumes: `visibleNav` from `@/lib/cms/admin-nav`.
- Produces: a `marketing` group with leaf `/admin/marketing/snapshots` gated by `marketing.view`.

- [ ] **Step 1: Write the failing test** `tests/cms/marketing-nav.test.ts`

```ts
import { describe, it, expect } from "vitest"
import { visibleNav } from "@/lib/cms/admin-nav"

it("shows the Marketing group only with marketing.view", () => {
  const without = visibleNav([]).find((g) => g.key === "marketing")
  expect(without).toBeUndefined()
  const withPriv = visibleNav(["marketing.view"]).find((g) => g.key === "marketing")
  expect(withPriv).toBeDefined()
  expect(withPriv!.items[0].href).toBe("/admin/marketing/snapshots")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/cms/marketing-nav.test.ts`
Expected: FAIL — group `marketing` is undefined.

- [ ] **Step 3: Implement** in `lib/cms/admin-nav.ts`

1. Add `LineChart` and `Camera` to the `lucide-react` import line at the top.
2. Insert a new group into `NAV_GROUPS` immediately after the `community` group:

```ts
  {
    key: "marketing", label: "Marketing", icon: LineChart, items: [
      { label: "Protocol snapshots", href: "/admin/marketing/snapshots", icon: Camera, privilege: "marketing.view" },
    ],
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx vitest run tests/cms/marketing-nav.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cms/admin-nav.ts tests/cms/marketing-nav.test.ts
git commit -m "feat(marketing): Marketing nav group"
```

---

### Task 9: List page + capture form

**Files:**
- Create: `app/admin/marketing/snapshots/page.tsx`
- Create: `components/cms/marketing/SnapshotsClient.tsx`
- Create: `lib/marketing/format.ts` (shared display helpers)
- Test: `tests/marketing/snapshots-client.test.tsx`
- Test: `tests/marketing/format.test.ts`

**Interfaces:**
- Consumes: `listSnapshots` (Task 6), `currentUser`, `captureSnapshotAction`/`deleteSnapshotAction` (Task 7).
- Produces: `fmtNum`, `fmtUsd`, `fmtInt` in `lib/marketing/format.ts`; the list route at `/admin/marketing/snapshots`.

- [ ] **Step 1: Write the failing test** `tests/marketing/format.test.ts`

```ts
import { describe, it, expect } from "vitest"
import { fmtUsd, fmtInt, fmtNum } from "@/lib/marketing/format"

it("formats with em-dash for null", () => {
  expect(fmtInt(null)).toBe("—")
  expect(fmtUsd(null)).toBe("—")
  expect(fmtNum(null)).toBe("—")
})
it("formats numbers", () => {
  expect(fmtInt(7891)).toBe("7,891")
  expect(fmtUsd(67.45)).toBe("$67.45")
  expect(fmtNum(885.19, 2)).toBe("885.19")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/marketing/format.test.ts`
Expected: FAIL — cannot find module `@/lib/marketing/format`.

- [ ] **Step 3: Implement** `lib/marketing/format.ts`

```ts
export const DASH = "—"
export const fmtInt = (v: number | null): string =>
  v === null ? DASH : v.toLocaleString("en-US", { maximumFractionDigits: 0 })
export const fmtUsd = (v: number | null): string =>
  v === null ? DASH : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const fmtNum = (v: number | null, dp = 2): string =>
  v === null ? DASH : v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx vitest run tests/marketing/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing component test** `tests/marketing/snapshots-client.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/actions/marketing/snapshots", () => ({
  captureSnapshotAction: vi.fn().mockResolvedValue({ ok: true, value: { id: "s2" } }),
  deleteSnapshotAction: vi.fn().mockResolvedValue({ ok: true }),
}))

import { SnapshotsClient } from "@/components/cms/marketing/SnapshotsClient"
import type { SnapshotRow } from "@/lib/marketing/snapshot-store"

const row: SnapshotRow = {
  id: "s1", createdAt: new Date("2026-06-24T12:00:00Z"), label: "before X", context: "X_POST",
  refUrl: null, articleId: null, note: null, createdByName: "Vitor", articleSlug: null,
  payload: { capturedAt: "t", partial: false,
    protocol: { totalBtcLocked: 100.6, alkanesBtcLocked: null, brc20BtcLocked: null, btcUsd: 62000, btcHeight: null, metashrewHeight: null, source: "store" },
    tokens: { diesel: { id: "2:0", name: "DIESEL", symbol: "DIESEL", holders: 7891, priceUsd: 67.45, supply: "1", marketcapUsd: null, fdvUsd: null, volume24hUsd: null, priceChange24h: null, priceChange7d: null, priceChange30d: null }, fire: { id: "2:77623", name: "FIRE", symbol: "FIRE", holders: 955, priceUsd: 53.7, supply: "1", marketcapUsd: null, fdvUsd: null, volume24hUsd: null, priceChange24h: null, priceChange7d: null, priceChange30d: null }, frbtc: { id: "32:0", name: "frBTC", symbol: "frBTC", holders: 2246, priceUsd: 51881, supply: "1", marketcapUsd: null, fdvUsd: null, volume24hUsd: null, priceChange24h: null, priceChange7d: null, priceChange30d: null } },
    ratios: { btcDiesel: 885, btcFire: 1127 } },
}

beforeEach(() => cleanup())

it("renders a row with the label and DIESEL holders", () => {
  const { getByText } = render(<SnapshotsClient snapshots={[row]} articles={[]} />)
  expect(getByText("before X")).toBeTruthy()
  expect(getByText("7,891")).toBeTruthy()
})

it("opens the capture form and submits", async () => {
  const { getByText, getByLabelText } = render(<SnapshotsClient snapshots={[]} articles={[]} />)
  fireEvent.click(getByText("Capture snapshot"))
  fireEvent.change(getByLabelText("Label"), { target: { value: "test" } })
  fireEvent.click(getByText("Capture"))
  const { captureSnapshotAction } = await import("@/actions/marketing/snapshots")
  expect(captureSnapshotAction).toHaveBeenCalled()
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `CI=true npx vitest run tests/marketing/snapshots-client.test.tsx`
Expected: FAIL — cannot find module `@/components/cms/marketing/SnapshotsClient`.

- [ ] **Step 7: Implement** `components/cms/marketing/SnapshotsClient.tsx`

```tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { captureSnapshotAction, deleteSnapshotAction } from "@/actions/marketing/snapshots"
import { SNAPSHOT_CONTEXTS, type SnapshotContext } from "@/lib/marketing/types"
import type { SnapshotRow } from "@/lib/marketing/snapshot-store"
import { fmtInt, fmtUsd } from "@/lib/marketing/format"

export interface ArticleOption { id: string; title: string }

export function SnapshotsClient({ snapshots, articles }: { snapshots: SnapshotRow[]; articles: ArticleOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState("")
  const [context, setContext] = useState<SnapshotContext>("GENERAL")
  const [refUrl, setRefUrl] = useState("")
  const [articleId, setArticleId] = useState("")
  const [note, setNote] = useState("")

  async function submit() {
    setBusy(true); setError(null)
    const r = await captureSnapshotAction({
      label, context, refUrl: refUrl || undefined, articleId: articleId || undefined, note: note || undefined,
    })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setOpen(false); setLabel(""); setRefUrl(""); setArticleId(""); setNote(""); setContext("GENERAL")
    router.refresh()
  }

  async function remove(id: string) {
    await deleteSnapshotAction(id)
    router.refresh()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Protocol snapshots</h1>
        <button onClick={() => setOpen(true)} className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500">
          Capture snapshot
        </button>
      </div>

      {open && (
        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-zinc-400">Label
              <input aria-label="Label" value={label} onChange={(e) => setLabel(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white" />
            </label>
            <label className="text-sm text-zinc-400">Context
              <select aria-label="Context" value={context} onChange={(e) => setContext(e.target.value as SnapshotContext)}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white">
                {SNAPSHOT_CONTEXTS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-sm text-zinc-400">Post URL (optional)
              <input aria-label="Post URL" value={refUrl} onChange={(e) => setRefUrl(e.target.value)} placeholder="https://x.com/…"
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white" />
            </label>
            <label className="text-sm text-zinc-400">Article (optional)
              <select aria-label="Article" value={articleId} onChange={(e) => setArticleId(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white">
                <option value="">None</option>
                {articles.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </label>
            <label className="text-sm text-zinc-400 sm:col-span-2">Note (optional)
              <textarea aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white" />
            </label>
          </div>
          {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button disabled={busy} onClick={submit} className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {busy ? "Capturing…" : "Capture"}
            </button>
            <button onClick={() => setOpen(false)} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300">Cancel</button>
          </div>
        </div>
      )}

      {snapshots.length === 0 ? (
        <p className="text-sm text-zinc-500">No snapshots yet. Capture one before your next article or X post.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr><th className="py-2">When</th><th>Label</th><th>Context</th><th>DIESEL holders</th><th>DIESEL price</th><th>BTC locked</th><th>By</th><th></th></tr>
          </thead>
          <tbody>
            {snapshots.map((s) => (
              <tr key={s.id} className="border-t border-zinc-800 text-zinc-300">
                <td className="py-2">{s.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td><Link href={`/admin/marketing/snapshots/${s.id}`} className="text-sky-300 hover:underline">{s.label}</Link></td>
                <td>{s.context}</td>
                <td>{fmtInt(s.payload.tokens.diesel.holders)}</td>
                <td>{fmtUsd(s.payload.tokens.diesel.priceUsd)}</td>
                <td>{fmtInt(s.payload.protocol.totalBtcLocked)}</td>
                <td>{s.createdByName ?? "—"}</td>
                <td><button onClick={() => remove(s.id)} className="text-rose-400 hover:underline">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 8: Run the component test to verify it passes**

Run: `CI=true npx vitest run tests/marketing/snapshots-client.test.tsx`
Expected: PASS.

- [ ] **Step 9: Implement the page** `app/admin/marketing/snapshots/page.tsx`

```tsx
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import prisma from "@/lib/prisma"
import { listSnapshots } from "@/lib/marketing/snapshot-store"
import { SnapshotsClient } from "@/components/cms/marketing/SnapshotsClient"

export const dynamic = "force-dynamic"

export default async function MarketingSnapshotsPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("marketing.view")) redirect("/admin")

  const [snapshots, articles] = await Promise.all([
    listSnapshots(),
    prisma.article.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 50,
      select: { id: true, translations: { select: { title: true }, take: 1 } },
    }),
  ])

  const articleOptions = articles.map((a) => ({ id: a.id, title: a.translations[0]?.title ?? a.id }))
  return <SnapshotsClient snapshots={snapshots} articles={articleOptions} />
}
```

- [ ] **Step 10: Typecheck + full suite**

Run: `npx tsc --noEmit && CI=true npx vitest run`
Expected: tsc 0, all green.

- [ ] **Step 11: Commit**

```bash
git add lib/marketing/format.ts components/cms/marketing/SnapshotsClient.tsx app/admin/marketing/snapshots/page.tsx tests/marketing/format.test.ts tests/marketing/snapshots-client.test.tsx
git commit -m "feat(marketing): snapshots list page + capture form"
```

---

### Task 10: Detail page + compare

**Files:**
- Create: `app/admin/marketing/snapshots/[id]/page.tsx`
- Create: `components/cms/marketing/SnapshotDetail.tsx`
- Test: `tests/marketing/snapshot-detail.test.tsx`

**Interfaces:**
- Consumes: `getSnapshot`/`listSnapshots` (Task 6), `diffSnapshots` (Task 5), `liveSnapshotAction` (Task 7), format helpers (Task 9).
- Produces: the detail route `/admin/marketing/snapshots/[id]` with a compare selector.

- [ ] **Step 1: Write the failing test** `tests/marketing/snapshot-detail.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

vi.mock("@/actions/marketing/snapshots", () => ({ liveSnapshotAction: vi.fn() }))

import { SnapshotDetail } from "@/components/cms/marketing/SnapshotDetail"
import type { SnapshotRow } from "@/lib/marketing/snapshot-store"
import type { SnapshotPayload } from "@/lib/marketing/types"

const payload = (holders: number): SnapshotPayload => ({
  capturedAt: "t", partial: false,
  protocol: { totalBtcLocked: 100, alkanesBtcLocked: null, brc20BtcLocked: null, btcUsd: 62000, btcHeight: null, metashrewHeight: null, source: "store" },
  tokens: {
    diesel: { id: "2:0", name: "DIESEL", symbol: "DIESEL", holders, priceUsd: 67, supply: "1", marketcapUsd: null, fdvUsd: null, volume24hUsd: null, priceChange24h: null, priceChange7d: null, priceChange30d: null },
    fire: { id: "2:77623", name: "FIRE", symbol: "FIRE", holders: 955, priceUsd: 53, supply: "1", marketcapUsd: null, fdvUsd: null, volume24hUsd: null, priceChange24h: null, priceChange7d: null, priceChange30d: null },
    frbtc: { id: "32:0", name: "frBTC", symbol: "frBTC", holders: 2246, priceUsd: 51881, supply: "1", marketcapUsd: null, fdvUsd: null, volume24hUsd: null, priceChange24h: null, priceChange7d: null, priceChange30d: null },
  },
  ratios: { btcDiesel: 885, btcFire: 1127 },
})

const row = (id: string, holders: number): SnapshotRow => ({
  id, createdAt: new Date("2026-06-24T12:00:00Z"), label: `snap ${id}`, context: "GENERAL",
  refUrl: null, articleId: null, note: null, createdByName: "Vitor", articleSlug: null, payload: payload(holders),
})

beforeEach(() => cleanup())

it("renders DIESEL holders for the current snapshot", () => {
  const { getByText } = render(<SnapshotDetail snapshot={row("s1", 7891)} others={[]} />)
  expect(getByText("7,891")).toBeTruthy()
})

it("shows deltas when comparing to another snapshot", () => {
  const { getByLabelText, getByText } = render(
    <SnapshotDetail snapshot={row("s1", 7891)} others={[row("s0", 7000)]} />,
  )
  fireEvent.change(getByLabelText("Compare with"), { target: { value: "s0" } })
  // delta on DIESEL holders = 7891 - 7000 = +891
  expect(getByText("+891")).toBeTruthy()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/marketing/snapshot-detail.test.tsx`
Expected: FAIL — cannot find module `@/components/cms/marketing/SnapshotDetail`.

- [ ] **Step 3: Implement** `components/cms/marketing/SnapshotDetail.tsx`

```tsx
"use client"

import { useMemo, useState } from "react"
import { liveSnapshotAction } from "@/actions/marketing/snapshots"
import { diffSnapshots, type DiffRow } from "@/lib/marketing/diff"
import type { SnapshotRow } from "@/lib/marketing/snapshot-store"
import type { SnapshotPayload, SnapshotTokenBlock } from "@/lib/marketing/types"
import { fmtInt, fmtUsd, fmtNum } from "@/lib/marketing/format"

const sign = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

function TokenCard({ t }: { t: SnapshotTokenBlock }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="mb-2 font-semibold text-white">{t.name ?? t.id} <span className="text-zinc-500">{t.id}</span></h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-zinc-300">
        <dt className="text-zinc-500">Holders</dt><dd>{fmtInt(t.holders)}</dd>
        <dt className="text-zinc-500">Price</dt><dd>{fmtUsd(t.priceUsd)}</dd>
        <dt className="text-zinc-500">Market cap</dt><dd>{fmtUsd(t.marketcapUsd)}</dd>
        <dt className="text-zinc-500">FDV</dt><dd>{fmtUsd(t.fdvUsd)}</dd>
        <dt className="text-zinc-500">24h volume</dt><dd>{fmtUsd(t.volume24hUsd)}</dd>
        <dt className="text-zinc-500">24h change</dt><dd>{fmtNum(t.priceChange24h)}%</dd>
      </dl>
    </div>
  )
}

export function SnapshotDetail({ snapshot, others }: { snapshot: SnapshotRow; others: SnapshotRow[] }) {
  const [compareId, setCompareId] = useState("")
  const [livePayload, setLivePayload] = useState<SnapshotPayload | null>(null)
  const p = snapshot.payload

  const comparePayload: SnapshotPayload | null = useMemo(() => {
    if (compareId === "live") return livePayload
    return others.find((o) => o.id === compareId)?.payload ?? null
  }, [compareId, livePayload, others])

  const rows: DiffRow[] = comparePayload ? diffSnapshots(comparePayload, p) : []

  async function pick(value: string) {
    setCompareId(value)
    if (value === "live" && !livePayload) {
      const r = await liveSnapshotAction()
      if (r.ok) setLivePayload(r.value)
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">{snapshot.label}</h1>
      <p className="mb-4 text-sm text-zinc-500">
        {snapshot.context} · captured {snapshot.createdAt.toISOString().slice(0, 16).replace("T", " ")} by {snapshot.createdByName ?? "—"}
        {snapshot.refUrl && <> · <a href={snapshot.refUrl} className="text-sky-300 hover:underline" target="_blank" rel="noreferrer">post ↗</a></>}
        {snapshot.payload.partial && <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-400">partial</span>}
      </p>
      {snapshot.note && <p className="mb-4 text-sm text-zinc-400">{snapshot.note}</p>}

      <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <h3 className="mb-2 font-semibold text-white">Protocol</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-zinc-300 sm:grid-cols-4">
          <dt className="text-zinc-500">Total BTC Locked</dt><dd>{fmtInt(p.protocol.totalBtcLocked)}</dd>
          <dt className="text-zinc-500">BTC price</dt><dd>{fmtUsd(p.protocol.btcUsd)}</dd>
          <dt className="text-zinc-500">BTC/DIESEL</dt><dd>{fmtNum(p.ratios.btcDiesel)}</dd>
          <dt className="text-zinc-500">BTC/FIRE</dt><dd>{fmtNum(p.ratios.btcFire)}</dd>
        </dl>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <TokenCard t={p.tokens.diesel} />
        <TokenCard t={p.tokens.fire} />
        <TokenCard t={p.tokens.frbtc} />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <label className="text-sm text-zinc-400">Compare with{" "}
          <select aria-label="Compare with" value={compareId} onChange={(e) => pick(e.target.value)}
            className="ml-2 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-white">
            <option value="">—</option>
            <option value="live">Live now</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.label} ({o.createdAt.toISOString().slice(0, 10)})</option>)}
          </select>
        </label>
        {rows.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-zinc-500"><tr><th className="py-1">Metric</th><th>Before</th><th>After</th><th>Δ</th><th>Δ%</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.path} className="border-t border-zinc-800 text-zinc-300">
                  <td className="py-1">{r.label}</td>
                  <td>{r.before === null ? "—" : r.before.toLocaleString("en-US")}</td>
                  <td>{r.after === null ? "—" : r.after.toLocaleString("en-US")}</td>
                  <td className={r.deltaAbs && r.deltaAbs > 0 ? "text-emerald-400" : r.deltaAbs && r.deltaAbs < 0 ? "text-rose-400" : ""}>
                    {r.deltaAbs === null ? "—" : sign(Number(r.deltaAbs.toFixed(2)))}
                  </td>
                  <td>{r.deltaPct === null ? "—" : `${sign(Number(r.deltaPct.toFixed(2)))}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the component test to verify it passes**

Run: `CI=true npx vitest run tests/marketing/snapshot-detail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement the page** `app/admin/marketing/snapshots/[id]/page.tsx`

```tsx
import { notFound, redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { getSnapshot, listSnapshots } from "@/lib/marketing/snapshot-store"
import { SnapshotDetail } from "@/components/cms/marketing/SnapshotDetail"

export const dynamic = "force-dynamic"

export default async function SnapshotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("marketing.view")) redirect("/admin")

  const { id } = await params
  const [snapshot, all] = await Promise.all([getSnapshot(id), listSnapshots()])
  if (!snapshot) notFound()

  const others = all.filter((s) => s.id !== id)
  return <SnapshotDetail snapshot={snapshot} others={others} />
}
```

- [ ] **Step 6: Full gates**

Run: `npx tsc --noEmit && CI=true npx vitest run && npx next build`
Expected: tsc 0, all tests green, build 0.

- [ ] **Step 7: Commit**

```bash
git add app/admin/marketing/snapshots/[id]/page.tsx components/cms/marketing/SnapshotDetail.tsx tests/marketing/snapshot-detail.test.tsx
git commit -m "feat(marketing): snapshot detail page + compare"
```

---

## Final verification (before PR)

- [ ] `npx prisma generate` — clean
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `CI=true npx vitest run` — all green (new: alkane-details, snapshot, diff, snapshot-store, snapshots-action, marketing-nav, iam-registry marketing cases, format, snapshots-client, snapshot-detail)
- [ ] `npx next build` — 0
- [ ] Open PR `feat/marketing-protocol-snapshot` → `main`.

## Deploy (human-owned, after merge)

1. Merge PR → Cloud Build produces `subfrost-io:<short-sha>`.
2. Bump `newTag` in `k8s/kustomization.yaml` via a deploy PR → merge.
3. Flux: reconcile `gitrepository/subfrost-io` (source) **before** `kustomization/subfrost-io`.
4. The `migrate` init container runs `prisma db push` → creates `MarketingSnapshot`.
5. Live check: `/admin/marketing/snapshots` (307 for unprivileged), capture one snapshot as an ADMIN, confirm DIESEL/FIRE/frBTC holders + prices populate, compare-to-live renders deltas, `/api/health` 200.

## Spec coverage self-check

- Anchor (manual + optional post-ref): Task 1 (fields) + Task 7 (input) + Task 9 (form). ✓
- Rich data set incl. frBTC: Task 3 (token block) + Task 4 (assembler). ✓
- Holders must-have: Task 3 maps `holders`. ✓
- Approach A (JSON rows): Task 1 (`payload Json`) + Task 6 (store). ✓
- Gating `marketing.view` (non-restricted): Task 2 + page/action gates. ✓
- Marketing nav: Task 8. ✓
- List + capture + detail + compare (snapshot/live): Tasks 9–10. ✓
- Testing (TDD per unit): every task. ✓
- Additive schema / no warmer change: Task 1 + Deploy notes. ✓
