# Financials › Treasury Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/admin/financials/treasury` dashboard showing two BSC wallets' BNB + BEP20 holdings in USD (per wallet + grand total), via GoldRush `balances_v2`, snapshot-only, cached and gated.

**Architecture:** A pure normalizer (`shapes.ts`) turns GoldRush items into typed wallet snapshots; a thin `source/live.ts` fetches GoldRush per address; a gated, Redis-cached server action (`actions/cms/financials.ts`) serves the snapshot with a last-good fallback; a server page passes the result to a client `TreasuryManager`. A new "Financials" nav group hosts the leaf, gated on a single `FINANCIALS_PRIVILEGE` constant (placeholder until flex's IAM lands).

**Tech Stack:** Next.js 16 App Router (server actions + route handlers), TypeScript, Vitest (+ @testing-library/react for the UI test), Node `fetch`, Redis cache (`@/lib/redis`), GoldRush/Covalent REST.

## Global Constraints

- Provider is **GoldRush (Covalent)** `balances_v2`: `GET https://api.covalenthq.com/v1/bsc-mainnet/address/{addr}/balances_v2/?quote-currency=USD`, auth header `Authorization: Bearer ${GOLDRUSH_API_KEY}`.
- Show **native BNB + all BEP20 with amount > 0**, USD-valued; **drop `is_spam` and zero-balance**; tokens with no `quote` are kept with `usd: null` and contribute 0 to totals.
- **Snapshot only** — no history, no DB table, no migration.
- **No IAM/privilege/migration of our own** — gate on `FINANCIALS_PRIVILEGE` (a single constant, placeholder `"VIEW_AUDIT"`, swapped to flex's real privilege later in one line).
- **Never 500** — degrade: missing key → `not_configured`; upstream error → last-good (`stale:true`) or `upstream`.
- Two BSC addresses are **provisional** (a one-line change in `config.ts`): `0x74deeb5b221f257532e3ba1483dc214605025b81`, `0x35E18d19c8B63B168B6049ed0a97073A847CE9e4`.
- Branch → PR → merge. Never push to `main`. `.claude/` and `.npmrc` are untracked — never `git add` them.
- Per-task gates: `tsc --noEmit` 0, `CI=true npx vitest run` green; `next build` 0 at the end.

---

### Task 1: Config + shapes + pure normalizer

**Files:**
- Create: `lib/financials/treasury/config.ts`
- Create: `lib/financials/treasury/shapes.ts`
- Test: `tests/financials/treasury-shapes.test.ts`

**Interfaces:**
- Produces: `TREASURY_WALLETS`, `BSC_CHAIN` (config); `GoldRushItem`, `TreasuryToken`, `TreasuryWallet`, `TreasurySnapshot` (types); `normalizeBalances(items: GoldRushItem[], address: string, label?: string): TreasuryWallet`; `round2(n: number): number`.

- [ ] **Step 1: Write the failing test**

Create `tests/financials/treasury-shapes.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { normalizeBalances, type GoldRushItem } from "@/lib/financials/treasury/shapes"

const items: GoldRushItem[] = [
  { contract_address: "0xnative", contract_ticker_symbol: "BNB", contract_name: "BNB",
    contract_decimals: 18, balance: "1500000000000000000", quote: 900, native_token: true, is_spam: false },
  { contract_address: "0xusdt", contract_ticker_symbol: "USDT", contract_name: "Tether USD",
    contract_decimals: 18, balance: "2000000000000000000000", quote: 2000, native_token: false, is_spam: false },
  { contract_address: "0xnoprice", contract_ticker_symbol: "XYZ", contract_name: "No Price",
    contract_decimals: 18, balance: "5000000000000000000", quote: null, native_token: false, is_spam: false },
  { contract_address: "0xspam", contract_ticker_symbol: "SPAM", contract_name: "Spam",
    contract_decimals: 18, balance: "9999000000000000000000", quote: 9999, native_token: false, is_spam: true },
  { contract_address: "0xzero", contract_ticker_symbol: "ZERO", contract_name: "Zero",
    contract_decimals: 18, balance: "0", quote: 0, native_token: false, is_spam: false },
]

describe("normalizeBalances", () => {
  const w = normalizeBalances(items, "0xWALLET", "Main")

  it("keeps non-spam, non-zero tokens and drops spam + zero balances", () => {
    expect(w.tokens.map((t) => t.symbol)).toEqual(["USDT", "BNB", "XYZ"]) // sorted by usd desc, nulls last
    expect(w.tokens.find((t) => t.symbol === "SPAM")).toBeUndefined()
    expect(w.tokens.find((t) => t.symbol === "ZERO")).toBeUndefined()
  })

  it("applies decimals, maps native + usd, and keeps no-price tokens as usd null", () => {
    const bnb = w.tokens.find((t) => t.symbol === "BNB")!
    expect(bnb.amount).toBe(1.5)
    expect(bnb.isNative).toBe(true)
    expect(bnb.usd).toBe(900)
    expect(w.tokens.find((t) => t.symbol === "XYZ")!.usd).toBeNull()
  })

  it("totals only known USD and carries address + label", () => {
    expect(w.totalUsd).toBe(2900) // 2000 + 900, XYZ (null) contributes 0
    expect(w.address).toBe("0xWALLET")
    expect(w.label).toBe("Main")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/financials/treasury-shapes.test.ts`
Expected: FAIL — `@/lib/financials/treasury/shapes` does not exist.

- [ ] **Step 3: Write config + shapes**

Create `lib/financials/treasury/config.ts`:

```ts
/** Treasury wallets tracked on BSC. PROVISIONAL (Vitor 2026-06-22, ~90% — flex
 *  may change); update here (one line each). */
export const TREASURY_WALLETS: { address: string; label?: string }[] = [
  { address: "0x74deeb5b221f257532e3ba1483dc214605025b81" },
  { address: "0x35E18d19c8B63B168B6049ed0a97073A847CE9e4" },
]

/** GoldRush chain name for Binance Smart Chain mainnet. */
export const BSC_CHAIN = "bsc-mainnet"
```

Create `lib/financials/treasury/shapes.ts`:

```ts
/** One item from GoldRush `balances_v2` `data.items[]` (the fields we use). */
export interface GoldRushItem {
  contract_address: string
  contract_ticker_symbol: string | null
  contract_name: string | null
  contract_decimals: number | null
  balance: string | null
  quote: number | null
  native_token: boolean
  is_spam?: boolean
  logo_url?: string | null
}

export interface TreasuryToken {
  contract: string
  symbol: string
  name: string
  amount: number
  /** USD value (GoldRush `quote`), or null when the provider has no price. */
  usd: number | null
  isNative: boolean
  logo?: string
}

export interface TreasuryWallet {
  address: string
  label?: string
  totalUsd: number
  tokens: TreasuryToken[]
}

export interface TreasurySnapshot {
  wallets: TreasuryWallet[]
  grandTotalUsd: number
  fetchedAt: string
}

export const round2 = (n: number): number => Math.round(n * 100) / 100

/** Pure: GoldRush items → a normalized wallet. Drops spam and zero balances,
 *  applies decimals, maps native + USD, keeps no-price tokens (usd null), and
 *  sorts by USD desc (nulls last). Totals only known USD. */
export function normalizeBalances(
  items: GoldRushItem[],
  address: string,
  label?: string,
): TreasuryWallet {
  const tokens: TreasuryToken[] = items
    .filter((it) => !it.is_spam)
    .map((it) => ({
      contract: it.contract_address,
      symbol: it.contract_ticker_symbol ?? "?",
      name: it.contract_name ?? "Unknown",
      amount: Number(it.balance ?? "0") / 10 ** (it.contract_decimals ?? 0),
      usd: typeof it.quote === "number" ? it.quote : null,
      isNative: it.native_token === true,
      logo: it.logo_url ?? undefined,
    }))
    .filter((t) => t.amount > 0)
    .sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1))
  const totalUsd = round2(tokens.reduce((s, t) => s + (t.usd ?? 0), 0))
  return { address, label, totalUsd, tokens }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/financials/treasury-shapes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
npx tsc --noEmit
git add lib/financials/treasury/config.ts lib/financials/treasury/shapes.ts tests/financials/treasury-shapes.test.ts
git commit -m "feat(financials): treasury config + pure GoldRush normalizer"
```
Expected: tsc 0 errors.

---

### Task 2: GoldRush source (live fetch)

**Files:**
- Create: `lib/financials/treasury/source/live.ts`
- Test: `tests/financials/treasury-source.test.ts`

**Interfaces:**
- Consumes: `normalizeBalances`, `round2`, types from Task 1; `TREASURY_WALLETS`, `BSC_CHAIN`.
- Produces: `fetchWalletBalances(address: string, label?: string): Promise<TreasuryWallet>`; `fetchTreasurySnapshot(): Promise<TreasurySnapshot>`.

- [ ] **Step 1: Write the failing test**

Create `tests/financials/treasury-source.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { fetchWalletBalances } from "@/lib/financials/treasury/source/live"

function mockFetch(json: unknown, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({ ok, status, json: async () => json })
  vi.stubGlobal("fetch", fn)
  return fn
}

beforeEach(() => {
  process.env.GOLDRUSH_API_KEY = "test-goldrush-key"
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const sample = {
  data: {
    items: [
      { contract_address: "0xnative", contract_ticker_symbol: "BNB", contract_name: "BNB",
        contract_decimals: 18, balance: "1000000000000000000", quote: 600, native_token: true, is_spam: false },
    ],
  },
  error: false,
}

describe("fetchWalletBalances", () => {
  it("calls the BSC balances_v2 endpoint with the Bearer key and normalizes", async () => {
    const fn = mockFetch(sample)
    const w = await fetchWalletBalances("0xABC", "Main")
    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain("/bsc-mainnet/address/0xABC/balances_v2/")
    expect(url).toContain("quote-currency=USD")
    expect(opts.headers.Authorization).toBe("Bearer test-goldrush-key")
    expect(w.label).toBe("Main")
    expect(w.tokens[0].symbol).toBe("BNB")
    expect(w.totalUsd).toBe(600)
  })

  it("throws when the key is missing", async () => {
    delete process.env.GOLDRUSH_API_KEY
    await expect(fetchWalletBalances("0xABC")).rejects.toThrow(/GOLDRUSH_API_KEY/)
  })

  it("throws on a non-OK response", async () => {
    mockFetch({ error: true }, false, 429)
    await expect(fetchWalletBalances("0xABC")).rejects.toThrow(/GoldRush 429/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/financials/treasury-source.test.ts`
Expected: FAIL — `@/lib/financials/treasury/source/live` does not exist.

- [ ] **Step 3: Write the source**

Create `lib/financials/treasury/source/live.ts`:

```ts
import {
  normalizeBalances,
  round2,
  type GoldRushItem,
  type TreasurySnapshot,
  type TreasuryWallet,
} from "@/lib/financials/treasury/shapes"
import { TREASURY_WALLETS, BSC_CHAIN } from "@/lib/financials/treasury/config"

const BASE = "https://api.covalenthq.com/v1"
const TIMEOUT_MS = 10_000

/** One wallet's holdings from GoldRush. Throws on missing key or non-OK so the
 *  caller (the action) can degrade — never returns a partial/silent snapshot. */
export async function fetchWalletBalances(address: string, label?: string): Promise<TreasuryWallet> {
  const key = process.env.GOLDRUSH_API_KEY
  if (!key) throw new Error("GOLDRUSH_API_KEY not configured")
  const url = `${BASE}/${BSC_CHAIN}/address/${address}/balances_v2/?quote-currency=USD`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`GoldRush ${res.status}`)
  const json = (await res.json()) as { data?: { items?: GoldRushItem[] } }
  return normalizeBalances(json?.data?.items ?? [], address, label)
}

/** All treasury wallets in parallel + the grand USD total. */
export async function fetchTreasurySnapshot(): Promise<TreasurySnapshot> {
  const wallets = await Promise.all(
    TREASURY_WALLETS.map((w) => fetchWalletBalances(w.address, w.label)),
  )
  const grandTotalUsd = round2(wallets.reduce((s, w) => s + w.totalUsd, 0))
  return { wallets, grandTotalUsd, fetchedAt: new Date().toISOString() }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/financials/treasury-source.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
npx tsc --noEmit
git add lib/financials/treasury/source/live.ts tests/financials/treasury-source.test.ts
git commit -m "feat(financials): GoldRush treasury source (per-wallet + snapshot)"
```
Expected: tsc 0 errors.

---

### Task 3: Privilege constant + gated, cached action

**Files:**
- Create: `lib/financials/privilege.ts`
- Create: `actions/cms/financials.ts`
- Test: `tests/financials/treasury-action.test.ts`

**Interfaces:**
- Consumes: `fetchTreasurySnapshot` (Task 2); `TreasurySnapshot` (Task 1); `currentUser` from `@/lib/cms/authz`; `cacheGet`/`cacheSet` from `@/lib/redis`.
- Produces: `FINANCIALS_PRIVILEGE: Privilege`; `treasuryOverviewAction(opts?: { refresh?: boolean }): Promise<TreasuryResult>` where `TreasuryResult = { ok: true; snapshot: TreasurySnapshot; stale?: boolean } | { ok: false; error: "unauthorized" | "not_configured" | "upstream" }`.

- [ ] **Step 1: Write the failing test**

Create `tests/financials/treasury-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/lib/redis", () => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }))
vi.mock("@/lib/financials/treasury/source/live", () => ({ fetchTreasurySnapshot: vi.fn() }))

import { treasuryOverviewAction } from "@/actions/cms/financials"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import { currentUser } from "@/lib/cms/authz"
import { cacheGet, cacheSet } from "@/lib/redis"
import { fetchTreasurySnapshot } from "@/lib/financials/treasury/source/live"

const snap = { wallets: [], grandTotalUsd: 0, fetchedAt: "2026-06-22T00:00:00Z" }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.GOLDRUSH_API_KEY = "k"
  vi.mocked(currentUser).mockResolvedValue({ privileges: [FINANCIALS_PRIVILEGE] } as never)
  vi.mocked(cacheGet).mockResolvedValue(null)
  vi.mocked(cacheSet).mockResolvedValue(undefined)
})

describe("treasuryOverviewAction", () => {
  it("rejects a caller without the financials privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue({ privileges: [] } as never)
    expect(await treasuryOverviewAction()).toEqual({ ok: false, error: "unauthorized" })
    expect(fetchTreasurySnapshot).not.toHaveBeenCalled()
  })

  it("returns not_configured when the key is unset", async () => {
    delete process.env.GOLDRUSH_API_KEY
    expect(await treasuryOverviewAction()).toEqual({ ok: false, error: "not_configured" })
  })

  it("serves a cache hit without calling the provider", async () => {
    vi.mocked(cacheGet).mockResolvedValueOnce(snap as never)
    const r = await treasuryOverviewAction()
    expect(r).toEqual({ ok: true, snapshot: snap })
    expect(fetchTreasurySnapshot).not.toHaveBeenCalled()
  })

  it("fetches + caches on a miss", async () => {
    vi.mocked(fetchTreasurySnapshot).mockResolvedValueOnce(snap as never)
    const r = await treasuryOverviewAction()
    expect(r).toEqual({ ok: true, snapshot: snap })
    expect(cacheSet).toHaveBeenCalled()
  })

  it("serves last-good (stale) when the provider throws", async () => {
    vi.mocked(fetchTreasurySnapshot).mockRejectedValueOnce(new Error("upstream down"))
    vi.mocked(cacheGet).mockResolvedValueOnce(null).mockResolvedValueOnce(snap as never) // miss live, hit last-good
    const r = await treasuryOverviewAction()
    expect(r).toEqual({ ok: true, snapshot: snap, stale: true })
  })

  it("returns upstream when the provider throws and there is no last-good", async () => {
    vi.mocked(fetchTreasurySnapshot).mockRejectedValueOnce(new Error("upstream down"))
    vi.mocked(cacheGet).mockResolvedValue(null)
    expect(await treasuryOverviewAction()).toEqual({ ok: false, error: "upstream" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/financials/treasury-action.test.ts`
Expected: FAIL — `@/actions/cms/financials` and `@/lib/financials/privilege` do not exist.

- [ ] **Step 3: Write the privilege constant + action**

Create `lib/financials/privilege.ts`:

```ts
import type { Privilege } from "@prisma/client"

/** The privilege that unlocks the Financials section.
 *  PLACEHOLDER: gates on VIEW_AUDIT (admin-tier) until flex's IAM lands a
 *  dedicated, auditor-grantable financials privilege — then swap this one
 *  constant (the nav leaf, the action, and the page all read it). */
export const FINANCIALS_PRIVILEGE: Privilege = "VIEW_AUDIT"
```

Create `actions/cms/financials.ts`:

```ts
"use server"

import { currentUser } from "@/lib/cms/authz"
import { cacheGet, cacheSet } from "@/lib/redis"
import { fetchTreasurySnapshot } from "@/lib/financials/treasury/source/live"
import type { TreasurySnapshot } from "@/lib/financials/treasury/shapes"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"

export type TreasuryResult =
  | { ok: true; snapshot: TreasurySnapshot; stale?: boolean }
  | { ok: false; error: "unauthorized" | "not_configured" | "upstream" }

const CACHE_KEY = "financials:treasury"
const LAST_GOOD_KEY = "financials:treasury:last"
const TTL = 300 // 5 min
const LAST_GOOD_TTL = 86_400 // 24h

/** Snapshot of the BSC treasury wallets. Gated on FINANCIALS_PRIVILEGE, Redis-
 *  cached (5 min) with a 24h last-good fallback. Never throws: a provider blip
 *  serves the previous snapshot (stale) or reports `upstream`. */
export async function treasuryOverviewAction(opts?: { refresh?: boolean }): Promise<TreasuryResult> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(FINANCIALS_PRIVILEGE)) return { ok: false, error: "unauthorized" }
  if (!process.env.GOLDRUSH_API_KEY) return { ok: false, error: "not_configured" }

  if (!opts?.refresh) {
    const cached = await cacheGet<TreasurySnapshot>(CACHE_KEY)
    if (cached) return { ok: true, snapshot: cached }
  }

  try {
    const snapshot = await fetchTreasurySnapshot()
    await cacheSet(CACHE_KEY, snapshot, TTL)
    await cacheSet(LAST_GOOD_KEY, snapshot, LAST_GOOD_TTL)
    return { ok: true, snapshot }
  } catch (error) {
    console.error("[financials/treasury] upstream error:", error)
    const lastGood = await cacheGet<TreasurySnapshot>(LAST_GOOD_KEY)
    if (lastGood) return { ok: true, snapshot: lastGood, stale: true }
    return { ok: false, error: "upstream" }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/financials/treasury-action.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
npx tsc --noEmit
git add lib/financials/privilege.ts actions/cms/financials.ts tests/financials/treasury-action.test.ts
git commit -m "feat(financials): gated + cached treasuryOverviewAction"
```
Expected: tsc 0 errors.

---

### Task 4: Page + TreasuryManager UI

**Files:**
- Create: `app/admin/financials/treasury/page.tsx`
- Create: `components/cms/financials/TreasuryManager.tsx`
- Test: `tests/financials/treasury-ui.test.tsx`

**Interfaces:**
- Consumes: `treasuryOverviewAction`, `TreasuryResult` (Task 3); `currentUser`, `FINANCIALS_PRIVILEGE`.
- Produces: `TreasuryManager({ initial }: { initial: TreasuryResult })` (client component).

- [ ] **Step 1: Write the failing test**

Create `tests/financials/treasury-ui.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { TreasuryManager } from "@/components/cms/financials/TreasuryManager"
import type { TreasuryResult } from "@/actions/cms/financials"

vi.mock("@/actions/cms/financials", () => ({ treasuryOverviewAction: vi.fn() }))

const ok: TreasuryResult = {
  ok: true,
  snapshot: {
    grandTotalUsd: 2900,
    fetchedAt: "2026-06-22T00:00:00Z",
    wallets: [
      { address: "0xAAA", label: "Main", totalUsd: 2900, tokens: [
        { contract: "0xusdt", symbol: "USDT", name: "Tether", amount: 2000, usd: 2000, isNative: false },
        { contract: "0xnative", symbol: "BNB", name: "BNB", amount: 1.5, usd: 900, isNative: true },
      ] },
    ],
  },
}

describe("TreasuryManager", () => {
  it("renders the grand total and the wallet's tokens", () => {
    render(<TreasuryManager initial={ok} />)
    expect(screen.getByText(/\$2,900/)).toBeTruthy()
    expect(screen.getByText("USDT")).toBeTruthy()
    expect(screen.getByText("BNB")).toBeTruthy()
  })

  it("shows the not-configured state", () => {
    render(<TreasuryManager initial={{ ok: false, error: "not_configured" }} />)
    expect(screen.getByText(/not configured/i)).toBeTruthy()
  })

  it("shows the upstream-error state", () => {
    render(<TreasuryManager initial={{ ok: false, error: "upstream" }} />)
    expect(screen.getByText(/unavailable/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/financials/treasury-ui.test.tsx`
Expected: FAIL — `@/components/cms/financials/TreasuryManager` does not exist.

(If the run errors that `@testing-library/react`/jsdom isn't available, mirror the setup of an existing UI test, e.g. `tests/` for `CommunitiesManager`/onramp; the repo already runs `.tsx` component tests.)

- [ ] **Step 3: Write the component + page**

Create `components/cms/financials/TreasuryManager.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import { treasuryOverviewAction, type TreasuryResult } from "@/actions/cms/financials"

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" })
const amt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 6 })

export function TreasuryManager({ initial }: { initial: TreasuryResult }) {
  const [result, setResult] = useState<TreasuryResult>(initial)
  const [pending, startTransition] = useTransition()

  function refresh() {
    startTransition(async () => setResult(await treasuryOverviewAction({ refresh: true })))
  }

  if (!result.ok) {
    const msg =
      result.error === "not_configured"
        ? "Treasury data source is not configured (GOLDRUSH_API_KEY missing)."
        : result.error === "upstream"
          ? "Treasury data is temporarily unavailable. Try again shortly."
          : "You do not have access to financials."
    return <p className="text-sm text-zinc-400">{msg}</p>
  }

  const { snapshot, stale } = result
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-3xl font-bold text-white">{usd(snapshot.grandTotalUsd)}</div>
          <div className="text-xs text-zinc-500">
            Total across {snapshot.wallets.length} wallet(s)
            {stale ? " · showing last cached snapshot" : ""}
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={pending}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {snapshot.wallets.map((w) => (
        <div key={w.address} className="rounded-lg border border-zinc-800 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="font-mono text-xs text-zinc-400">{w.label ?? w.address}</div>
            <div className="text-lg font-semibold text-white">{usd(w.totalUsd)}</div>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {w.tokens.map((t) => (
                <tr key={t.contract} className="border-t border-zinc-900">
                  <td className="py-1.5 text-zinc-200">
                    {t.symbol}
                    {t.isNative ? <span className="ml-1 text-[10px] text-zinc-500">native</span> : null}
                  </td>
                  <td className="py-1.5 text-right text-zinc-400">{amt(t.amount)}</td>
                  <td className="py-1.5 text-right text-zinc-200">
                    {t.usd === null ? "—" : usd(t.usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
```

Create `app/admin/financials/treasury/page.tsx`:

```tsx
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import { treasuryOverviewAction } from "@/actions/cms/financials"
import { TreasuryManager } from "@/components/cms/financials/TreasuryManager"

export const dynamic = "force-dynamic"

export default async function TreasuryPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes(FINANCIALS_PRIVILEGE)) redirect("/admin")

  const initial = await treasuryOverviewAction()

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">Treasury</h1>
      <p className="mb-6 text-sm text-zinc-500">
        On-chain holdings of the BSC treasury wallets (BNB + BEP20), valued in USD.
      </p>
      <TreasuryManager initial={initial} />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/financials/treasury-ui.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
npx tsc --noEmit
git add app/admin/financials/treasury/page.tsx components/cms/financials/TreasuryManager.tsx tests/financials/treasury-ui.test.tsx
git commit -m "feat(financials): treasury page + TreasuryManager UI"
```
Expected: tsc 0 errors.

---

### Task 5: Financials nav group + admin-nav test

Adding a nav group changes the "all groups for ADMIN" assertion in the existing nav test, so update that test in the same task (TDD: change the expectation first, watch it fail, then add the group).

**Files:**
- Modify: `lib/cms/admin-nav.ts`
- Modify: `tests/cms/admin-nav.test.ts`

**Interfaces:**
- Consumes: `FINANCIALS_PRIVILEGE` (Task 3).

- [ ] **Step 1: Update the nav test to expect the new group (fails first)**

In `tests/cms/admin-nav.test.ts`, update the "all groups for ADMIN" test (rename 5→6 and insert `"financials"` between `"billing"` and `"settings"`):

```ts
  it("shows all 6 groups for ADMIN (all privileges)", () => {
    const groups = visibleNav([...ALL_PRIVILEGES])
    expect(groups.map((g) => g.key)).toEqual([
      "articles", "community", "compliance", "billing", "financials", "settings",
    ])
    expect(groups.find((g) => g.key === "billing")!.items).toHaveLength(10)
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/cms/admin-nav.test.ts`
Expected: FAIL — the actual groups are still the old 5 (no `"financials"`).

- [ ] **Step 3: Add the Financials group to the nav**

In `lib/cms/admin-nav.ts`: add `Banknote, Wallet` to the `lucide-react` import line, add the `FINANCIALS_PRIVILEGE` import, and insert the group between the `billing` and `settings` groups.

Add import (after the existing imports):
```ts
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
```

Extend the lucide import line to include `Banknote, Wallet`.

Insert this group object in `NAV_GROUPS` immediately after the `billing` group and before the `settings` group:
```ts
  {
    key: "financials", label: "Financials", icon: Banknote, items: [
      { label: "Treasury", href: "/admin/financials/treasury", icon: Wallet, privilege: FINANCIALS_PRIVILEGE },
    ],
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/cms/admin-nav.test.ts`
Expected: PASS.

- [ ] **Step 5: Full verification + commit**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && npx tsc --noEmit && CI=true npx vitest run && npx next build`
Expected: tsc 0; full vitest green (new financials tests + existing); next build 0.
Note: the CI "Test" job can flake on pre-existing `tests/api/frbtc-issued.test.ts` / `tests/billing/money.test.ts` (forks-pool unhandled-rejection) — re-run if only those fail; not a regression here.

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add lib/cms/admin-nav.ts tests/cms/admin-nav.test.ts
git commit -m "feat(financials): Financials nav group with Treasury leaf"
```

---

### Task 6 (operational — execute with the user's go, not a subagent): GoldRush key + secret/ESO/env + deploy

Same pattern as the FUEL key wiring. **Unlike FUEL, the key value is issued by GoldRush** (a free account), not self-generated. Done directly, carefully, after the code PR merges.

**Files:**
- Modify: `k8s/external-secrets.yaml`, `k8s/deployment.yaml`, `k8s/kustomization.yaml`

- [ ] **Step 1: Open the code PR**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && git push -u origin feat/financials-treasury
gh pr create --title "Financials > Treasury (BSC holdings via GoldRush)" --body "<spec link + summary>"
```
Get the user's go to merge.

- [ ] **Step 2: Obtain the GoldRush key**

A human creates a free account at goldrush.dev and provides the API key (or it is created via browser with a user-provided email). Record it for Secret Manager. (No self-generation — it is provider-issued.)

- [ ] **Step 3: Create the Secret Manager secret**

Create `goldrush-api-key` + add the version via io-sa (full cloud-platform scope), mirroring the FUEL `fuel-api-key` creation (`.git/sdd/create-fuel-secret.py` pattern, but the value is the provider key, not a generated one). Verify the version is `ENABLED`.

- [ ] **Step 4: Wire ESO + deployment env (only after the secret exists)**

Add to `k8s/external-secrets.yaml` an entry mapping `goldrush-api-key` → `GOLDRUSH_API_KEY`. Add `GOLDRUSH_API_KEY` (`optional: true`) to the env block in `k8s/deployment.yaml`, mirroring the `FUEL_API_KEY` / `STRIPE_*` entries.

- [ ] **Step 5: Build + roll**

After merge: Cloud Build tags the image with the merge short-sha; bump `newTag` in `k8s/kustomization.yaml` (deploy PR) → Flux rolls GKE. Force reconcile if needed (the `kubectl-io.sh` annotate command).

- [ ] **Step 6: Validate live**

After the key is set and the deploy is live: open `/admin/financials/treasury` as a user holding the financials privilege → shows the two wallets' BNB + BEP20 holdings with USD + a grand total. Cross-check a couple of balances against BscScan for the two addresses.

- [ ] **Step 7 (coordination): swap the placeholder privilege**

When flex's IAM lands the real financials privilege, change the single constant in `lib/financials/privilege.ts` (and confirm `tests/cms/admin-nav.test.ts` still matches if the privilege identity changed). One-line swap; the nav, action, and page all follow.

---

## Self-Review

**Spec coverage:** Decisions 1-2 (all holdings + USD via GoldRush) → Tasks 1-2. Decision 3 (snapshot only) → no DB/migration anywhere. Decision 4 (IAM = flex's) → `FINANCIALS_PRIVILEGE` placeholder (Task 3) + swap (Task 6 Step 7). Error table → Task 3 action + Task 4 UI states. Secret/deploy → Task 6. Testing section → Tasks 1-5 tests. Nav group → Task 5. No gaps.

**Placeholder scan:** `<spec link + summary>` is PR-body prose for an operational step, not code. All code steps contain complete code. `FINANCIALS_PRIVILEGE = "VIEW_AUDIT"` is an intentional, documented placeholder (a real existing enum value), not a stub.

**Type consistency:** `normalizeBalances(items, address, label?)`, `round2`, `GoldRushItem`, `TreasuryToken/Wallet/Snapshot` defined in Task 1 are consumed verbatim in Tasks 2-4. `fetchTreasurySnapshot`/`fetchWalletBalances` (Task 2) consumed in Task 3. `TreasuryResult` + `treasuryOverviewAction` (Task 3) consumed in Task 4 + the UI test. `FINANCIALS_PRIVILEGE` (Task 3) consumed in Task 4 page + Task 5 nav. Mock shapes (`fetchTreasurySnapshot`, `cacheGet/Set`, `currentUser`) match the real signatures. Consistent.
