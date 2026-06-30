# X Engagement Analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a aba `/admin/marketing/x` ("X analytics") com duas visões alternáveis (Performance de conteúdo · Atribuição ao protocolo), alimentada por uma ingestão diária das métricas públicas dos posts da @subfrost_news.

**Architecture:** Reusa o modelo `MarketingSnapshot` com `context="X_POST"` (zero migration; payload JSON). Um cron diário Bearer-gated (`/api/marketing/x-cron`) lê a timeline via API X (`public_metrics`), grava 1 snapshot/post/dia (idempotente) e atualiza `MarketingPush.metrics` dos posts casados. A UI (server component + client component) reusa o padrão da aba Protocol analytics (recharts + ChartContainer). Helpers de análise são funções puras testáveis (`lib/marketing/x-series.ts`).

**Tech Stack:** Next.js 16 (App Router), TypeScript, Prisma + Postgres, recharts, Vitest (happy-dom), Tailwind. Deploy: GKE via Flux + Cloud Scheduler + ESO.

## Global Constraints

- Falar **pt-BR** com o usuário (memória `language-portuguese`).
- Toda mudança de código vai por **branch → PR → merge** (memória `always-pr-for-code-changes`). Branch já criada: `feat/x-engagement-analytics`. Merge/deploy são **human-owned** — confirmar com o Vitor.
- **pnpm 9, node 22.** Comandos de verificação: `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`.
- Prisma client: **`import prisma from "@/lib/prisma"`** (default export). DB convention = **`prisma db push`** (sem migrations) — mas esta frente **não muda o schema** (payload JSON), então é no-op de schema.
- Privilégio de acesso: **`marketing.view`** em todas as páginas/rotas da aba.
- **Credenciais do X NUNCA no Windows nem no repo.** Secret `X_BEARER_TOKEN` só via ESO. Cron Bearer-gated por `PREFETCH_SECRET`.
- **UTC** consistente: dia = `toISOString().slice(0,10)`; idempotência por (post, dia UTC).
- **Testes:** mock do Prisma **local** por arquivo (`vi.mock("@/lib/prisma", () => ({ default: {...} }))`); **nada** bate na API X real (mockar `fetch`). Igual aos integration live-RPC, que ficam offline.
- Handle da conta: **subfrost_news** (sem `@` na URL da API).
- Janela de acompanhamento diário: **7 dias**. Janela de atribuição: **1d/3d/7d** (cálculo on-the-fly sobre a série DAILY).
- Degradação: sem `X_BEARER_TOKEN`, cron responde `{ ok:true, skipped:"not_configured" }` e a aba mostra banner "X API não configurada".
- Deploy gotcha: `newTag` em `k8s/kustomization.yaml` **SEMPRE com aspas**.

---

### Task 1: Tipos + transform puro da API X

**Files:**
- Create: `lib/marketing/x-types.ts`
- Create: `lib/marketing/x-client.ts` (apenas as partes puras nesta task: `extractTweetId`, `mapApiTweetToPayload`, tipo `ApiTweet`)
- Test: `tests/marketing/x-client-transform.test.ts`

**Interfaces:**
- Produces:
  - `interface XPostMetrics { impressions: number|null; likes: number|null; reposts: number|null; replies: number|null; quotes: number|null; bookmarks: number|null }`
  - `interface XPostSnapshotPayload { capturedAt: string; tweetId: string; url: string; postedAt: string; text: string; metrics: XPostMetrics; partial: boolean }`
  - `interface ApiTweet { id: string; text: string; created_at?: string; public_metrics?: {...} }`
  - `function extractTweetId(url: string|null|undefined): string|null`
  - `function mapApiTweetToPayload(t: ApiTweet, capturedAt: string, handle?: string): XPostSnapshotPayload`

- [ ] **Step 1: Write the failing test**

```ts
// tests/marketing/x-client-transform.test.ts
import { describe, it, expect } from "vitest"
import { extractTweetId, mapApiTweetToPayload, type ApiTweet } from "@/lib/marketing/x-client"

describe("extractTweetId", () => {
  it("extracts from x.com and twitter.com, with query strings", () => {
    expect(extractTweetId("https://x.com/subfrost_news/status/1790000000000000001")).toBe("1790000000000000001")
    expect(extractTweetId("https://twitter.com/foo/status/123?s=20")).toBe("123")
  })
  it("returns null for non-tweet urls and nullish", () => {
    expect(extractTweetId("https://x.com/subfrost_news")).toBeNull()
    expect(extractTweetId(null)).toBeNull()
    expect(extractTweetId(undefined)).toBeNull()
  })
})

describe("mapApiTweetToPayload", () => {
  const cap = "2026-06-30T00:05:00.000Z"
  it("maps public_metrics to our metric names and builds the canonical url", () => {
    const t: ApiTweet = {
      id: "999", text: "gm", created_at: "2026-06-29T12:00:00.000Z",
      public_metrics: { impression_count: 1000, like_count: 10, retweet_count: 3, reply_count: 2, quote_count: 1, bookmark_count: 4 },
    }
    const p = mapApiTweetToPayload(t, cap)
    expect(p.tweetId).toBe("999")
    expect(p.url).toBe("https://x.com/subfrost_news/status/999")
    expect(p.metrics).toEqual({ impressions: 1000, likes: 10, reposts: 3, replies: 2, quotes: 1, bookmarks: 4 })
    expect(p.partial).toBe(false)
    expect(p.capturedAt).toBe(cap)
  })
  it("flags partial when a metric or created_at is missing", () => {
    const t: ApiTweet = { id: "1", text: "x", public_metrics: { like_count: 5 } }
    const p = mapApiTweetToPayload(t, cap)
    expect(p.metrics.impressions).toBeNull()
    expect(p.partial).toBe(true)
    expect(p.postedAt).toBe("")
  })
  it("truncates text to 280 chars", () => {
    const t: ApiTweet = { id: "2", text: "a".repeat(500), created_at: "2026-06-29T00:00:00Z", public_metrics: { impression_count: 1, like_count: 1, retweet_count: 1, reply_count: 1, quote_count: 1, bookmark_count: 1 } }
    expect(mapApiTweetToPayload(t, cap).text).toHaveLength(280)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/marketing/x-client-transform.test.ts`
Expected: FAIL — "Cannot find module '@/lib/marketing/x-client'".

- [ ] **Step 3: Create `lib/marketing/x-types.ts`**

```ts
// lib/marketing/x-types.ts
export interface XPostMetrics {
  impressions: number | null
  likes: number | null
  reposts: number | null
  replies: number | null
  quotes: number | null
  bookmarks: number | null
}

export interface XPostSnapshotPayload {
  capturedAt: string
  tweetId: string
  url: string
  postedAt: string
  text: string
  metrics: XPostMetrics
  partial: boolean
}
```

- [ ] **Step 4: Create the pure parts of `lib/marketing/x-client.ts`**

```ts
// lib/marketing/x-client.ts
import type { XPostMetrics, XPostSnapshotPayload } from "@/lib/marketing/x-types"

export const X_HANDLE = "subfrost_news"

export interface ApiTweet {
  id: string
  text: string
  created_at?: string
  public_metrics?: {
    impression_count?: number
    like_count?: number
    retweet_count?: number
    reply_count?: number
    quote_count?: number
    bookmark_count?: number
  }
}

export function extractTweetId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i)
  return m ? m[1] : null
}

const n = (v: number | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

export function mapApiTweetToPayload(t: ApiTweet, capturedAt: string, handle = X_HANDLE): XPostSnapshotPayload {
  const pm = t.public_metrics ?? {}
  const metrics: XPostMetrics = {
    impressions: n(pm.impression_count),
    likes: n(pm.like_count),
    reposts: n(pm.retweet_count),
    replies: n(pm.reply_count),
    quotes: n(pm.quote_count),
    bookmarks: n(pm.bookmark_count),
  }
  const partial = Object.values(metrics).some((v) => v === null) || !t.created_at
  return {
    capturedAt,
    tweetId: t.id,
    url: `https://x.com/${handle}/status/${t.id}`,
    postedAt: t.created_at ?? "",
    text: (t.text ?? "").slice(0, 280),
    metrics,
    partial,
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run tests/marketing/x-client-transform.test.ts`
Expected: PASS (3 tests in mapApiTweetToPayload + 2 in extractTweetId).

- [ ] **Step 6: Commit**

```bash
git add lib/marketing/x-types.ts lib/marketing/x-client.ts tests/marketing/x-client-transform.test.ts
git commit -m "feat(x-analytics): tipos + transform puro da API X"
```

---

### Task 2: Helpers de análise puros (`x-series.ts`)

**Files:**
- Create: `lib/marketing/x-series.ts`
- Test: `tests/marketing/x-series.test.ts`

**Interfaces:**
- Consumes: `XPostSnapshotPayload`, `XPostMetrics` (Task 1); `SnapshotRow` shape via a minimal local type; `SeriesPoint` from `@/lib/marketing/protocol-series`.
- Produces:
  - `interface XPostSnapshotRow { id: string; createdAt: Date; refUrl: string|null; payload: XPostSnapshotPayload }` (re-declared here for series helpers; the canonical one is exported from `x-store.ts` in Task 3 and is structurally identical — import from there once Task 3 lands)
  - `function engagementRate(m: XPostMetrics): number|null`
  - `interface XPostTableRow { tweetId; url; postedAt; text; metrics: XPostMetrics; engagementRate: number|null; capturedAt: string }`
  - `function buildXPostTable(rows: XPostSnapshotRow[]): XPostTableRow[]`
  - `interface XCurvePoint { date: string } & XPostMetrics`
  - `function buildXPostCurve(rows: XPostSnapshotRow[], tweetId: string): XCurvePoint[]`
  - `function attributionDelta(series: SeriesPoint[], postDateISO: string, days: number, key: "dieselHolders"|"btcLocked"|"dieselPrice"): number|null`
  - `interface AttributionRow {...}` and `function buildAttributionRows(posts: XPostTableRow[], series: SeriesPoint[]): AttributionRow[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/marketing/x-series.test.ts
import { describe, it, expect } from "vitest"
import { engagementRate, buildXPostTable, buildXPostCurve, attributionDelta, buildAttributionRows } from "@/lib/marketing/x-series"
import type { XPostSnapshotRow } from "@/lib/marketing/x-series"
import type { SeriesPoint } from "@/lib/marketing/protocol-series"

const m = (o: Partial<Record<keyof import("@/lib/marketing/x-types").XPostMetrics, number | null>>) => ({
  impressions: null, likes: null, reposts: null, replies: null, quotes: null, bookmarks: null, ...o,
})
const row = (id: string, day: string, cap: string, metrics: ReturnType<typeof m>, posted = "2026-06-20T00:00:00Z"): XPostSnapshotRow => ({
  id: `${id}-${cap}`, createdAt: new Date(`${day}T00:05:00Z`), refUrl: `https://x.com/subfrost_news/status/${id}`,
  payload: { capturedAt: cap, tweetId: id, url: `https://x.com/subfrost_news/status/${id}`, postedAt: posted, text: "t", metrics, partial: false },
})

describe("engagementRate", () => {
  it("sums engagements over impressions", () => {
    expect(engagementRate(m({ impressions: 1000, likes: 10, reposts: 5, replies: 3, quotes: 2, bookmarks: 0 }))).toBeCloseTo(0.02)
  })
  it("returns null when impressions are null or zero", () => {
    expect(engagementRate(m({ impressions: null, likes: 5 }))).toBeNull()
    expect(engagementRate(m({ impressions: 0, likes: 5 }))).toBeNull()
  })
})

describe("buildXPostTable", () => {
  it("keeps the latest snapshot per tweetId", () => {
    const rows = [
      row("A", "2026-06-28", "2026-06-28T00:05:00Z", m({ impressions: 100, likes: 1 })),
      row("A", "2026-06-29", "2026-06-29T00:05:00Z", m({ impressions: 200, likes: 2 })),
      row("B", "2026-06-29", "2026-06-29T00:05:00Z", m({ impressions: 50 }), "2026-06-25T00:00:00Z"),
    ]
    const table = buildXPostTable(rows)
    expect(table).toHaveLength(2)
    const a = table.find((t) => t.tweetId === "A")!
    expect(a.metrics.impressions).toBe(200)
  })
  it("sorts newest post first", () => {
    const rows = [
      row("OLD", "2026-06-29", "2026-06-29T00:05:00Z", m({ impressions: 1 }), "2026-06-10T00:00:00Z"),
      row("NEW", "2026-06-29", "2026-06-29T00:05:00Z", m({ impressions: 1 }), "2026-06-28T00:00:00Z"),
    ]
    expect(buildXPostTable(rows)[0].tweetId).toBe("NEW")
  })
})

describe("buildXPostCurve", () => {
  it("returns the daily points for one tweet", () => {
    const rows = [
      row("A", "2026-06-28", "2026-06-28T00:05:00Z", m({ impressions: 100 })),
      row("A", "2026-06-29", "2026-06-29T00:05:00Z", m({ impressions: 200 })),
      row("B", "2026-06-29", "2026-06-29T00:05:00Z", m({ impressions: 9 })),
    ]
    const curve = buildXPostCurve(rows, "A")
    expect(curve.map((c) => c.date)).toEqual(["2026-06-28", "2026-06-29"])
    expect(curve[1].impressions).toBe(200)
  })
})

const series: SeriesPoint[] = [
  { date: "2026-06-20", dieselHolders: 1000, dieselPrice: null, btcLocked: 50, firePrice: null, frbtcSupply: null, dieselMarketcap: null, btcUsd: null, btcDiesel: null, btcFire: null },
  { date: "2026-06-21", dieselHolders: 1010, dieselPrice: null, btcLocked: 51, firePrice: null, frbtcSupply: null, dieselMarketcap: null, btcUsd: null, btcDiesel: null, btcFire: null },
  { date: "2026-06-23", dieselHolders: 1040, dieselPrice: null, btcLocked: 55, firePrice: null, frbtcSupply: null, dieselMarketcap: null, btcUsd: null, btcDiesel: null, btcFire: null },
  { date: "2026-06-27", dieselHolders: 1100, dieselPrice: null, btcLocked: 60, firePrice: null, frbtcSupply: null, dieselMarketcap: null, btcUsd: null, btcDiesel: null, btcFire: null },
]

describe("attributionDelta", () => {
  it("computes holders delta 3 days after the post (nearest point on/before target)", () => {
    // post on 2026-06-20 → start=1000 ; +3d=2026-06-23 → 1040 ; delta=40
    expect(attributionDelta(series, "2026-06-20T10:00:00Z", 3, "dieselHolders")).toBe(40)
  })
  it("returns null when there is no series point at/after the post", () => {
    expect(attributionDelta(series, "2026-07-10T00:00:00Z", 3, "dieselHolders")).toBeNull()
  })
})

describe("buildAttributionRows", () => {
  it("attaches d1/d3/d7 deltas for holders and btcLocked", () => {
    const posts = buildXPostTable([row("A", "2026-06-21", "2026-06-21T00:05:00Z", m({ impressions: 100, likes: 2 }), "2026-06-20T00:00:00Z")])
    const out = buildAttributionRows(posts, series)
    expect(out[0].holders.d3).toBe(40)
    expect(out[0].btcLocked.d7).toBe(10) // 2026-06-20(50) → +7d 2026-06-27(60)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/marketing/x-series.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/marketing/x-series.ts`**

```ts
// lib/marketing/x-series.ts
import type { XPostMetrics, XPostSnapshotPayload } from "@/lib/marketing/x-types"
import type { SeriesPoint } from "@/lib/marketing/protocol-series"

export interface XPostSnapshotRow {
  id: string
  createdAt: Date
  refUrl: string | null
  payload: XPostSnapshotPayload
}

export function engagementRate(m: XPostMetrics): number | null {
  if (m.impressions === null || m.impressions === 0) return null
  const eng = (m.likes ?? 0) + (m.reposts ?? 0) + (m.replies ?? 0) + (m.quotes ?? 0) + (m.bookmarks ?? 0)
  return eng / m.impressions
}

export interface XPostTableRow {
  tweetId: string
  url: string
  postedAt: string
  text: string
  metrics: XPostMetrics
  engagementRate: number | null
  capturedAt: string
}

export function buildXPostTable(rows: XPostSnapshotRow[]): XPostTableRow[] {
  const latest = new Map<string, XPostSnapshotPayload>()
  for (const r of rows) {
    const p = r.payload
    const prev = latest.get(p.tweetId)
    if (!prev || p.capturedAt > prev.capturedAt) latest.set(p.tweetId, p)
  }
  return [...latest.values()]
    .map((p) => ({
      tweetId: p.tweetId, url: p.url, postedAt: p.postedAt, text: p.text,
      metrics: p.metrics, engagementRate: engagementRate(p.metrics), capturedAt: p.capturedAt,
    }))
    .sort((a, b) => (a.postedAt < b.postedAt ? 1 : a.postedAt > b.postedAt ? -1 : 0))
}

export interface XCurvePoint extends XPostMetrics {
  date: string
}

export function buildXPostCurve(rows: XPostSnapshotRow[], tweetId: string): XCurvePoint[] {
  return rows
    .filter((r) => r.payload.tweetId === tweetId)
    .map((r) => ({ date: r.createdAt.toISOString().slice(0, 10), ...r.payload.metrics }))
}

type AttrKey = "dieselHolders" | "btcLocked" | "dieselPrice"

export function attributionDelta(series: SeriesPoint[], postDateISO: string, days: number, key: AttrKey): number | null {
  if (series.length === 0) return null
  const postDay = postDateISO.slice(0, 10)
  const start = series.find((p) => p.date >= postDay)
  if (!start) return null
  const targetDay = new Date(new Date(`${start.date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
  let end: SeriesPoint | null = null
  for (const p of series) {
    if (p.date <= targetDay) end = p
    else break
  }
  if (!end) return null
  const a = start[key]
  const b = end[key]
  if (a === null || b === null) return null
  return b - a
}

export interface AttributionRow {
  tweetId: string
  url: string
  postedAt: string
  text: string
  engagementRate: number | null
  impressions: number | null
  holders: { d1: number | null; d3: number | null; d7: number | null }
  btcLocked: { d1: number | null; d3: number | null; d7: number | null }
}

export function buildAttributionRows(posts: XPostTableRow[], series: SeriesPoint[]): AttributionRow[] {
  return posts.map((p) => ({
    tweetId: p.tweetId, url: p.url, postedAt: p.postedAt, text: p.text,
    engagementRate: p.engagementRate, impressions: p.metrics.impressions,
    holders: {
      d1: attributionDelta(series, p.postedAt, 1, "dieselHolders"),
      d3: attributionDelta(series, p.postedAt, 3, "dieselHolders"),
      d7: attributionDelta(series, p.postedAt, 7, "dieselHolders"),
    },
    btcLocked: {
      d1: attributionDelta(series, p.postedAt, 1, "btcLocked"),
      d3: attributionDelta(series, p.postedAt, 3, "btcLocked"),
      d7: attributionDelta(series, p.postedAt, 7, "btcLocked"),
    },
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/marketing/x-series.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/marketing/x-series.ts tests/marketing/x-series.test.ts
git commit -m "feat(x-analytics): helpers puros de série, engagement rate e atribuição"
```

---

### Task 3: Store Prisma (`x-store.ts`)

**Files:**
- Create: `lib/marketing/x-store.ts`
- Test: `tests/marketing/x-store.test.ts`

**Interfaces:**
- Consumes: `XPostSnapshotPayload`, `XPostMetrics` (Task 1); `extractTweetId` (Task 1); `prisma` default export.
- Produces:
  - `import { type XPostSnapshotRow } from "@/lib/marketing/x-series"` re-exported here so callers import the canonical row type from `x-store`.
  - `function createXPostSnapshot(payload: XPostSnapshotPayload): Promise<XPostSnapshotRow>`
  - `function xPostSnapshotExistsOn(url: string, day: Date): Promise<boolean>`
  - `function listXPostSnapshots(): Promise<XPostSnapshotRow[]>`
  - `function updateMatchedPushMetrics(latestByTweetId: Map<string, XPostMetrics>): Promise<number>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/marketing/x-store.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  default: {
    marketingSnapshot: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    marketingPush: { findMany: vi.fn(), update: vi.fn() },
  },
}))

import { createXPostSnapshot, xPostSnapshotExistsOn, listXPostSnapshots, updateMatchedPushMetrics } from "@/lib/marketing/x-store"
import type { XPostSnapshotPayload, XPostMetrics } from "@/lib/marketing/x-types"
import prisma from "@/lib/prisma"

const metrics: XPostMetrics = { impressions: 1000, likes: 10, reposts: 3, replies: 2, quotes: 1, bookmarks: 4 }
const payload: XPostSnapshotPayload = {
  capturedAt: "2026-06-30T00:05:00.000Z", tweetId: "999",
  url: "https://x.com/subfrost_news/status/999", postedAt: "2026-06-29T12:00:00Z",
  text: "gm", metrics, partial: false,
}

beforeEach(() => vi.clearAllMocks())

describe("createXPostSnapshot", () => {
  it("writes a MarketingSnapshot row with context X_POST and refUrl=url", async () => {
    vi.mocked(prisma.marketingSnapshot.create).mockResolvedValueOnce({ id: "s1", createdAt: new Date("2026-06-30T00:05:00Z"), refUrl: payload.url, payload } as never)
    const row = await createXPostSnapshot(payload)
    expect(row.id).toBe("s1")
    const arg = vi.mocked(prisma.marketingSnapshot.create).mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data.context).toBe("X_POST")
    expect(arg.data.refUrl).toBe(payload.url)
    expect(arg.data.label).toContain("999")
  })
})

describe("xPostSnapshotExistsOn", () => {
  it("queries by context, refUrl and the UTC day window", async () => {
    vi.mocked(prisma.marketingSnapshot.findFirst).mockResolvedValueOnce({ id: "x" } as never)
    const exists = await xPostSnapshotExistsOn(payload.url, new Date("2026-06-30T18:00:00Z"))
    expect(exists).toBe(true)
    const where = (vi.mocked(prisma.marketingSnapshot.findFirst).mock.calls[0][0] as { where: Record<string, unknown> }).where
    expect(where.context).toBe("X_POST")
    expect(where.refUrl).toBe(payload.url)
    expect(where.createdAt).toMatchObject({ gte: new Date("2026-06-30T00:00:00Z"), lt: new Date("2026-07-01T00:00:00Z") })
  })
  it("returns false when none found", async () => {
    vi.mocked(prisma.marketingSnapshot.findFirst).mockResolvedValueOnce(null as never)
    expect(await xPostSnapshotExistsOn(payload.url, new Date("2026-06-30T00:00:00Z"))).toBe(false)
  })
})

describe("updateMatchedPushMetrics", () => {
  it("updates only X pushes whose refUrl tweetId is in the map", async () => {
    vi.mocked(prisma.marketingPush.findMany).mockResolvedValueOnce([
      { id: "p1", refUrl: "https://x.com/subfrost_news/status/999" },
      { id: "p2", refUrl: "https://x.com/subfrost_news/status/777" }, // not in map
      { id: "p3", refUrl: "https://example.com/not-a-tweet" },
    ] as never)
    const count = await updateMatchedPushMetrics(new Map([["999", metrics]]))
    expect(count).toBe(1)
    expect(prisma.marketingPush.update).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(prisma.marketingPush.update).mock.calls[0][0] as { where: { id: string }; data: { metrics: Record<string, unknown> } }
    expect(arg.where.id).toBe("p1")
    expect(arg.data.metrics).toMatchObject({ impressions: 1000, likes: 10, reposts: 3, clicks: null })
  })
})

describe("listXPostSnapshots", () => {
  it("filters by context X_POST ascending", async () => {
    vi.mocked(prisma.marketingSnapshot.findMany).mockResolvedValueOnce([{ id: "s1", createdAt: new Date(), refUrl: payload.url, payload }] as never)
    const rows = await listXPostSnapshots()
    expect(rows).toHaveLength(1)
    const arg = vi.mocked(prisma.marketingSnapshot.findMany).mock.calls[0][0] as { where: Record<string, unknown>; orderBy: Record<string, unknown> }
    expect(arg.where.context).toBe("X_POST")
    expect(arg.orderBy).toMatchObject({ createdAt: "asc" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/marketing/x-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/marketing/x-store.ts`**

```ts
// lib/marketing/x-store.ts
import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { extractTweetId } from "@/lib/marketing/x-client"
import type { XPostSnapshotPayload, XPostMetrics } from "@/lib/marketing/x-types"
import type { XPostSnapshotRow } from "@/lib/marketing/x-series"

export type { XPostSnapshotRow }

type DbRow = { id: string; createdAt: Date; refUrl: string | null; payload: unknown }
const map = (r: DbRow): XPostSnapshotRow => ({ id: r.id, createdAt: r.createdAt, refUrl: r.refUrl, payload: r.payload as XPostSnapshotPayload })

export async function createXPostSnapshot(payload: XPostSnapshotPayload): Promise<XPostSnapshotRow> {
  const r = (await prisma.marketingSnapshot.create({
    data: {
      label: `X @subfrost_news ${payload.tweetId} ${payload.capturedAt.slice(0, 10)}`,
      context: "X_POST",
      refUrl: payload.url,
      payload: payload as unknown as Prisma.InputJsonValue,
    },
  })) as DbRow
  return map(r)
}

export async function xPostSnapshotExistsOn(url: string, day: Date): Promise<boolean> {
  const gte = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()))
  const lt = new Date(gte.getTime() + 24 * 60 * 60 * 1000)
  const row = await prisma.marketingSnapshot.findFirst({
    where: { context: "X_POST", refUrl: url, createdAt: { gte, lt } },
    select: { id: true },
  })
  return row !== null
}

export async function listXPostSnapshots(): Promise<XPostSnapshotRow[]> {
  const rows = (await prisma.marketingSnapshot.findMany({
    where: { context: "X_POST" },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true, refUrl: true, payload: true },
  })) as DbRow[]
  return rows.map(map)
}

export async function updateMatchedPushMetrics(latestByTweetId: Map<string, XPostMetrics>): Promise<number> {
  const pushes = (await prisma.marketingPush.findMany({
    where: { channel: "X", refUrl: { not: null } },
    select: { id: true, refUrl: true },
  })) as { id: string; refUrl: string | null }[]
  let updated = 0
  for (const p of pushes) {
    const tid = extractTweetId(p.refUrl)
    if (!tid) continue
    const m = latestByTweetId.get(tid)
    if (!m) continue
    await prisma.marketingPush.update({
      where: { id: p.id },
      data: { metrics: { impressions: m.impressions, likes: m.likes, reposts: m.reposts, clicks: null } as unknown as Prisma.InputJsonValue },
    })
    updated++
  }
  return updated
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/marketing/x-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/marketing/x-store.ts tests/marketing/x-store.test.ts
git commit -m "feat(x-analytics): store Prisma (X_POST snapshots + match de push)"
```

---

### Task 4: Fetch da API X (`x-client.ts`: `resolveAccountId`, `fetchRecentPosts`, `isOlderThan`)

**Files:**
- Modify: `lib/marketing/x-client.ts` (append fetch functions + `XApiError`)
- Test: `tests/marketing/x-client-fetch.test.ts`

**Interfaces:**
- Consumes: `ApiTweet`, `X_HANDLE` (Task 1); `process.env.X_BEARER_TOKEN`, `process.env.X_ACCOUNT_ID`.
- Produces:
  - `class XApiError extends Error`
  - `function isOlderThan(iso: string, days: number, now?: number): boolean`
  - `function resolveAccountId(handle?: string): Promise<string>`
  - `function fetchRecentPosts(accountId: string, opts?: { sinceDays?: number; maxPages?: number }): Promise<ApiTweet[]>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/marketing/x-client-fetch.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { resolveAccountId, fetchRecentPosts, isOlderThan, XApiError } from "@/lib/marketing/x-client"

const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as Response

beforeEach(() => { vi.stubEnv("X_BEARER_TOKEN", "tok"); vi.stubEnv("X_ACCOUNT_ID", "") })
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe("isOlderThan", () => {
  it("compares against the window using the provided now", () => {
    const now = new Date("2026-06-30T00:00:00Z").getTime()
    expect(isOlderThan("2026-06-20T00:00:00Z", 7, now)).toBe(true)
    expect(isOlderThan("2026-06-28T00:00:00Z", 7, now)).toBe(false)
  })
})

describe("resolveAccountId", () => {
  it("throws not_configured without a bearer token", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "")
    await expect(resolveAccountId()).rejects.toBeInstanceOf(XApiError)
  })
  it("returns X_ACCOUNT_ID without calling the API when set", async () => {
    vi.stubEnv("X_ACCOUNT_ID", "42")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(await resolveAccountId()).toBe("42")
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("resolves via users/by/username", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: { id: "777" } }))
    vi.stubGlobal("fetch", fetchMock)
    expect(await resolveAccountId()).toBe("777")
    expect(String(fetchMock.mock.calls[0][0])).toContain("/users/by/username/subfrost_news")
  })
})

describe("fetchRecentPosts", () => {
  it("requests public_metrics, excludes retweets/replies, and paginates", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ data: [{ id: "1", text: "a" }], meta: { next_token: "P2" } }))
      .mockResolvedValueOnce(json({ data: [{ id: "2", text: "b" }] }))
    vi.stubGlobal("fetch", fetchMock)
    const out = await fetchRecentPosts("acc", {})
    expect(out.map((t) => t.id)).toEqual(["1", "2"])
    const url0 = String(fetchMock.mock.calls[0][0])
    expect(url0).toContain("/users/acc/tweets")
    expect(url0).toContain("tweet.fields=public_metrics")
    expect(url0).toContain("exclude=retweets%2Creplies")
    expect(String(fetchMock.mock.calls[1][0])).toContain("pagination_token=P2")
  })
  it("throws not_configured without a bearer token", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "")
    await expect(fetchRecentPosts("acc")).rejects.toBeInstanceOf(XApiError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/marketing/x-client-fetch.test.ts`
Expected: FAIL — `resolveAccountId`/`fetchRecentPosts` not exported.

- [ ] **Step 3: Append fetch functions to `lib/marketing/x-client.ts`**

```ts
// --- append to lib/marketing/x-client.ts ---

const API_BASE = "https://api.x.com/2"

export class XApiError extends Error {}

function bearer(): string | null {
  return process.env.X_BEARER_TOKEN || null
}

export function isOlderThan(iso: string, days: number, now = Date.now()): boolean {
  return now - new Date(iso).getTime() > days * 24 * 60 * 60 * 1000
}

export async function resolveAccountId(handle = X_HANDLE): Promise<string> {
  const token = bearer()
  if (!token) throw new XApiError("not_configured")
  const envId = process.env.X_ACCOUNT_ID
  if (envId) return envId
  const res = await fetch(`${API_BASE}/users/by/username/${handle}`, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new XApiError(`users/by/username ${res.status}`)
  const j = (await res.json()) as { data?: { id?: string } }
  const id = j?.data?.id
  if (!id) throw new XApiError("no account id")
  return id
}

export async function fetchRecentPosts(
  accountId: string,
  opts: { sinceDays?: number; maxPages?: number } = {},
): Promise<ApiTweet[]> {
  const token = bearer()
  if (!token) throw new XApiError("not_configured")
  const out: ApiTweet[] = []
  let pagination: string | undefined
  const maxPages = opts.maxPages ?? 50
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${API_BASE}/users/${accountId}/tweets`)
    url.searchParams.set("max_results", "100")
    url.searchParams.set("exclude", "retweets,replies")
    url.searchParams.set("tweet.fields", "public_metrics,created_at,text")
    if (pagination) url.searchParams.set("pagination_token", pagination)
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
    if (!res.ok) throw new XApiError(`users/:id/tweets ${res.status}`)
    const j = (await res.json()) as { data?: ApiTweet[]; meta?: { next_token?: string } }
    const data = j?.data ?? []
    out.push(...data)
    pagination = j?.meta?.next_token
    if (!pagination) break
    if (opts.sinceDays !== undefined) {
      const oldest = data[data.length - 1]
      if (oldest?.created_at && isOlderThan(oldest.created_at, opts.sinceDays)) break
    }
  }
  if (opts.sinceDays !== undefined) {
    return out.filter((t) => t.created_at && !isOlderThan(t.created_at, opts.sinceDays as number))
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/marketing/x-client-fetch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/marketing/x-client.ts tests/marketing/x-client-fetch.test.ts
git commit -m "feat(x-analytics): cliente fetch da API X (resolve conta + timeline paginada)"
```

---

### Task 5: Cron route (`/api/marketing/x-cron`)

**Files:**
- Create: `app/api/marketing/x-cron/route.ts`
- Test: `tests/api/x-cron.test.ts`

**Interfaces:**
- Consumes: `resolveAccountId`, `fetchRecentPosts`, `mapApiTweetToPayload`, `XApiError` (Tasks 1/4); `createXPostSnapshot`, `xPostSnapshotExistsOn`, `updateMatchedPushMetrics` (Task 3).
- Produces: `GET(request: NextRequest): Promise<NextResponse>` returning `{ ok, captured, skipped, failed, pushesUpdated, backfill }` (or `{ ok:true, skipped:"not_configured" }`, or `{ error }` 401/500).

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/x-cron.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/marketing/x-client", () => ({
  resolveAccountId: vi.fn(),
  fetchRecentPosts: vi.fn(),
  mapApiTweetToPayload: vi.fn(),
  XApiError: class extends Error {},
}))
vi.mock("@/lib/marketing/x-store", () => ({
  createXPostSnapshot: vi.fn(),
  xPostSnapshotExistsOn: vi.fn(),
  updateMatchedPushMetrics: vi.fn(),
}))

import { NextRequest } from "next/server"
import { GET } from "@/app/api/marketing/x-cron/route"
import * as xc from "@/lib/marketing/x-client"
import * as xs from "@/lib/marketing/x-store"

const req = (url = "https://subfrost.io/api/marketing/x-cron", auth?: string) =>
  new NextRequest(url, { method: "GET", headers: auth ? { authorization: auth } : {} })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("PREFETCH_SECRET", "")
  vi.stubEnv("X_BEARER_TOKEN", "tok")
})
afterEach(() => vi.unstubAllEnvs())

describe("GET /api/marketing/x-cron", () => {
  it("degrades to not_configured without X_BEARER_TOKEN", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "")
    const res = await GET(req())
    expect(await res.json()).toEqual({ ok: true, skipped: "not_configured" })
    expect(xc.resolveAccountId).not.toHaveBeenCalled()
  })

  it("401 when PREFETCH_SECRET is set and the bearer is wrong", async () => {
    vi.stubEnv("PREFETCH_SECRET", "s3cr3t")
    const res = await GET(req(undefined, "Bearer nope"))
    expect(res.status).toBe(401)
  })

  it("captures new posts, skips existing, and updates matched pushes", async () => {
    vi.mocked(xc.resolveAccountId).mockResolvedValue("acc")
    vi.mocked(xc.fetchRecentPosts).mockResolvedValue([{ id: "1", text: "a" }, { id: "2", text: "b" }] as never)
    vi.mocked(xc.mapApiTweetToPayload).mockImplementation((t: { id: string }) => ({
      capturedAt: "2026-06-30T00:05:00Z", tweetId: t.id, url: `https://x.com/subfrost_news/status/${t.id}`,
      postedAt: "2026-06-29T00:00:00Z", text: "x",
      metrics: { impressions: 1, likes: 1, reposts: 1, replies: 1, quotes: 1, bookmarks: 1 }, partial: false,
    }) as never)
    vi.mocked(xs.xPostSnapshotExistsOn).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    vi.mocked(xs.createXPostSnapshot).mockResolvedValue({ id: "s" } as never)
    vi.mocked(xs.updateMatchedPushMetrics).mockResolvedValue(1)

    const res = await GET(req())
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, captured: 1, skipped: 1, failed: 0, pushesUpdated: 1, backfill: false })
    expect(xs.createXPostSnapshot).toHaveBeenCalledTimes(1)
  })

  it("passes no window on backfill=1", async () => {
    vi.mocked(xc.resolveAccountId).mockResolvedValue("acc")
    vi.mocked(xc.fetchRecentPosts).mockResolvedValue([])
    vi.mocked(xs.updateMatchedPushMetrics).mockResolvedValue(0)
    await GET(req("https://subfrost.io/api/marketing/x-cron?backfill=1"))
    expect(vi.mocked(xc.fetchRecentPosts).mock.calls[0][1]).toEqual({})
  })

  it("returns 500 on an X API error", async () => {
    vi.mocked(xc.resolveAccountId).mockRejectedValue(new xc.XApiError("boom"))
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect((await res.json()).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/api/x-cron.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Create `app/api/marketing/x-cron/route.ts`**

```ts
// app/api/marketing/x-cron/route.ts
import { NextRequest, NextResponse } from "next/server"
import { resolveAccountId, fetchRecentPosts, mapApiTweetToPayload, XApiError } from "@/lib/marketing/x-client"
import { createXPostSnapshot, xPostSnapshotExistsOn, updateMatchedPushMetrics } from "@/lib/marketing/x-store"
import type { XPostMetrics } from "@/lib/marketing/x-types"

export const dynamic = "force-dynamic"

const WINDOW_DAYS = 7

export async function GET(request: NextRequest) {
  const secret = process.env.PREFETCH_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }
  if (!process.env.X_BEARER_TOKEN) {
    return NextResponse.json({ ok: true, skipped: "not_configured" })
  }

  const backfill = request.nextUrl.searchParams.get("backfill") === "1"
  const now = new Date()
  const capturedAt = now.toISOString()

  try {
    const accountId = await resolveAccountId()
    const tweets = await fetchRecentPosts(accountId, backfill ? {} : { sinceDays: WINDOW_DAYS })
    let captured = 0
    let skipped = 0
    let failed = 0
    const latest = new Map<string, XPostMetrics>()
    for (const t of tweets) {
      try {
        const payload = mapApiTweetToPayload(t, capturedAt)
        latest.set(payload.tweetId, payload.metrics)
        if (await xPostSnapshotExistsOn(payload.url, now)) {
          skipped++
          continue
        }
        await createXPostSnapshot(payload)
        captured++
      } catch {
        failed++
      }
    }
    const pushesUpdated = await updateMatchedPushMetrics(latest)
    return NextResponse.json({ ok: true, captured, skipped, failed, pushesUpdated, backfill })
  } catch (err) {
    const code = err instanceof XApiError ? err.message : String(err)
    return NextResponse.json({ ok: false, error: code }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/api/x-cron.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/marketing/x-cron/route.ts tests/api/x-cron.test.ts
git commit -m "feat(x-analytics): cron de ingestão /api/marketing/x-cron (Bearer-gated, backfill, degrada)"
```

---

### Task 6: Nav + página server (`admin-nav.ts` + `x/page.tsx`)

**Files:**
- Modify: `lib/cms/admin-nav.ts` (add icon import `AtSign`; add leaf to the `marketing` group)
- Create: `app/admin/marketing/x/page.tsx`
- Test: `tests/cms/admin-nav-x.test.ts`

**Interfaces:**
- Consumes: `visibleNav` (existing); `currentUser` from `@/lib/cms/authz`; `listXPostSnapshots` (Task 3); `listDailySnapshots` from `@/lib/marketing/snapshot-store`; `buildProtocolSeries` from `@/lib/marketing/protocol-series`; `buildXPostTable`, `buildXPostCurve`, `buildAttributionRows`, types `XPostTableRow`/`XCurvePoint`/`AttributionRow` (Task 2); `XAnalyticsClient` (Task 7 — created next; until then the page import will fail typecheck, so Task 7 must land before `tsc`/build of the page is green. Order: implement Task 7's client first OR stub it. This plan creates the page here and the client in Task 7; run `tsc` only after Task 7.)
- Produces: route `/admin/marketing/x`; nav leaf `{ label: "X analytics", href: "/admin/marketing/x", icon: AtSign, privilege: "marketing.view" }`.

> **Note on order:** Step 3 (the page) imports `XAnalyticsClient`, created in Task 7. Do the nav change + its test (Steps 1–2, 5) and the page file (Step 3) here, but run the full `tsc`/`build` verification at the end of Task 7. The nav test below does not import the page, so it passes independently.

- [ ] **Step 1: Write the failing test (nav)**

```ts
// tests/cms/admin-nav-x.test.ts
import { describe, it, expect } from "vitest"
import { NAV_GROUPS, visibleNav } from "@/lib/cms/admin-nav"

describe("X analytics nav leaf", () => {
  it("is registered in the marketing group, gated by marketing.view", () => {
    const marketing = NAV_GROUPS.find((g) => g.key === "marketing")!
    const leaf = marketing.items.find((i) => i.href === "/admin/marketing/x")
    expect(leaf).toBeDefined()
    expect(leaf!.label).toBe("X analytics")
    expect(leaf!.privilege).toBe("marketing.view")
  })
  it("is visible with marketing.view and hidden without it", () => {
    const withPriv = visibleNav(["marketing.view"]).find((g) => g.key === "marketing")!
    expect(withPriv.items.some((i) => i.href === "/admin/marketing/x")).toBe(true)
    const without = visibleNav([]).find((g) => g.key === "marketing")
    expect(without).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/cms/admin-nav-x.test.ts`
Expected: FAIL — leaf not found (`leaf` is undefined).

- [ ] **Step 3: Modify `lib/cms/admin-nav.ts`**

Add `AtSign` to the lucide import (first import block), e.g. append it to the existing list:

```ts
  KanbanSquare, Target, Package, Gavel, Building2, Github, FolderArchive, CalendarClock, TrendingUp, AtSign,
```

Add the leaf to the `marketing` group's `items` (after "Protocol analytics"):

```ts
  {
    key: "marketing", label: "Marketing", icon: LineChart, items: [
      { label: "Protocol snapshots", href: "/admin/marketing/snapshots", icon: Camera, privilege: "marketing.view" },
      { label: "Protocol analytics", href: "/admin/marketing/protocol", icon: TrendingUp, privilege: "marketing.view" },
      { label: "X analytics", href: "/admin/marketing/x", icon: AtSign, privilege: "marketing.view" },
      { label: "Site analytics", href: "/admin/marketing/analytics", icon: BarChart3, privilege: "marketing.view" },
      { label: "Schedule", href: "/admin/marketing/schedule", icon: CalendarClock, privilege: "marketing.view" },
    ],
  },
```

- [ ] **Step 4: Run nav test to verify it passes**

Run: `pnpm exec vitest run tests/cms/admin-nav-x.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `app/admin/marketing/x/page.tsx`**

```tsx
// app/admin/marketing/x/page.tsx
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { listXPostSnapshots } from "@/lib/marketing/x-store"
import { listDailySnapshots } from "@/lib/marketing/snapshot-store"
import { buildProtocolSeries } from "@/lib/marketing/protocol-series"
import { buildXPostTable, buildXPostCurve, buildAttributionRows, type XCurvePoint } from "@/lib/marketing/x-series"
import { XAnalyticsClient } from "@/components/cms/marketing/XAnalyticsClient"

export const dynamic = "force-dynamic"

export default async function XAnalyticsPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("marketing.view")) redirect("/admin")

  const [xRows, dailyRows] = await Promise.all([listXPostSnapshots(), listDailySnapshots()])
  const posts = buildXPostTable(xRows)
  const protocolSeries = buildProtocolSeries(dailyRows)
  const attribution = buildAttributionRows(posts, protocolSeries)
  const curves: Record<string, XCurvePoint[]> = Object.fromEntries(
    posts.map((p) => [p.tweetId, buildXPostCurve(xRows, p.tweetId)]),
  )
  const configured = Boolean(process.env.X_BEARER_TOKEN)

  return (
    <XAnalyticsClient
      posts={posts}
      curves={curves}
      attribution={attribution}
      protocolSeries={protocolSeries}
      configured={configured}
    />
  )
}
```

- [ ] **Step 6: Commit (nav + page; full tsc/build deferred to Task 7)**

```bash
git add lib/cms/admin-nav.ts app/admin/marketing/x/page.tsx tests/cms/admin-nav-x.test.ts
git commit -m "feat(x-analytics): nav leaf + página server /admin/marketing/x"
```

---

### Task 7: Client component (`XAnalyticsClient.tsx`)

**Files:**
- Create: `components/cms/marketing/XAnalyticsClient.tsx`
- Test: `tests/cms/x-analytics-client.test.tsx`

**Interfaces:**
- Consumes: `XPostTableRow`, `XCurvePoint`, `AttributionRow` (Task 2); `SeriesPoint` from `@/lib/marketing/protocol-series`; recharts + `@/components/ui/chart` (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartConfig`).
- Produces: `export function XAnalyticsClient(props: { posts: XPostTableRow[]; curves: Record<string, XCurvePoint[]>; attribution: AttributionRow[]; protocolSeries: SeriesPoint[]; configured: boolean }): JSX.Element`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/cms/x-analytics-client.test.tsx
import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { XAnalyticsClient } from "@/components/cms/marketing/XAnalyticsClient"
import type { XPostTableRow, AttributionRow, XCurvePoint } from "@/lib/marketing/x-series"
import type { SeriesPoint } from "@/lib/marketing/protocol-series"

const post: XPostTableRow = {
  tweetId: "999", url: "https://x.com/subfrost_news/status/999", postedAt: "2026-06-29T00:00:00Z",
  text: "Alkanes by the numbers", metrics: { impressions: 1000, likes: 50, reposts: 10, replies: 5, quotes: 2, bookmarks: 8 },
  engagementRate: 0.075, capturedAt: "2026-06-30T00:05:00Z",
}
const attribution: AttributionRow[] = [{
  tweetId: "999", url: post.url, postedAt: post.postedAt, text: post.text, engagementRate: 0.075, impressions: 1000,
  holders: { d1: 5, d3: 12, d7: 30 }, btcLocked: { d1: 1, d3: 2, d7: 4 },
}]
const curves: Record<string, XCurvePoint[]> = { "999": [{ date: "2026-06-29", impressions: 800, likes: 40, reposts: 8, replies: 4, quotes: 1, bookmarks: 5 }] }
const series: SeriesPoint[] = []

describe("XAnalyticsClient", () => {
  it("shows the not-configured banner and empty state when no posts", () => {
    render(<XAnalyticsClient posts={[]} curves={{}} attribution={[]} protocolSeries={series} configured={false} />)
    expect(screen.getByText(/X API não configurada/i)).toBeInTheDocument()
  })

  it("renders the post table in the Performance view", () => {
    render(<XAnalyticsClient posts={[post]} curves={curves} attribution={attribution} protocolSeries={series} configured />)
    expect(screen.getByText("Alkanes by the numbers")).toBeInTheDocument()
    expect(screen.getByText("1,000")).toBeInTheDocument()
  })

  it("switches to the Attribution view and shows the caveat + deltas", () => {
    render(<XAnalyticsClient posts={[post]} curves={curves} attribution={attribution} protocolSeries={series} configured />)
    fireEvent.click(screen.getByRole("button", { name: /Atribuição/i }))
    expect(screen.getByText(/sinal, não prova/i)).toBeInTheDocument()
    expect(screen.getByText("+12")).toBeInTheDocument() // holders d3
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/cms/x-analytics-client.test.tsx`
Expected: FAIL — component module not found.

- [ ] **Step 3: Create `components/cms/marketing/XAnalyticsClient.tsx`**

```tsx
"use client"

import { useState } from "react"
import { LineChart, Line, CartesianGrid, XAxis, YAxis, ReferenceLine } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { SeriesPoint } from "@/lib/marketing/protocol-series"
import type { XPostTableRow, XCurvePoint, AttributionRow } from "@/lib/marketing/x-series"

type View = "performance" | "attribution"

const int = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US"))
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`)
const delta = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toLocaleString("en-US")}`)

const curveConfig: ChartConfig = {
  impressions: { label: "Impressions", color: "#38bdf8" },
  likes: { label: "Likes", color: "#34d399" },
  reposts: { label: "Reposts", color: "#fbbf24" },
  replies: { label: "Replies", color: "#f97316" },
  quotes: { label: "Quotes", color: "#a78bfa" },
  bookmarks: { label: "Bookmarks", color: "#60a5fa" },
}
const protocolConfig: ChartConfig = {
  dieselHolders: { label: "DIESEL holders", color: "#38bdf8" },
  btcLocked: { label: "BTC locked", color: "#fbbf24" },
  dieselPrice: { label: "DIESEL price", color: "#34d399" },
}

export function XAnalyticsClient(props: {
  posts: XPostTableRow[]
  curves: Record<string, XCurvePoint[]>
  attribution: AttributionRow[]
  protocolSeries: SeriesPoint[]
  configured: boolean
}) {
  const { posts, curves, attribution, protocolSeries, configured } = props
  const [view, setView] = useState<View>("performance")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">X analytics</h1>

      {!configured && (
        <p className="mb-4 rounded-lg border border-amber-700/50 bg-amber-900/20 p-3 text-sm text-amber-300">
          X API não configurada — defina o secret <code>X_BEARER_TOKEN</code> (ESO) para ligar a ingestão.
        </p>
      )}

      <div className="mb-4 flex gap-1">
        {(["performance", "attribution"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-3 py-1.5 text-sm ${view === v ? "bg-sky-600 text-white" : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}
          >
            {v === "performance" ? "Performance" : "Atribuição"}
          </button>
        ))}
      </div>

      {posts.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
          Nenhum post capturado ainda — a ingestão diária roda quando o <code>X_BEARER_TOKEN</code> estiver populado.
        </p>
      ) : view === "performance" ? (
        <PerformanceView posts={posts} curves={curves} />
      ) : (
        <AttributionView attribution={attribution} protocolSeries={protocolSeries} />
      )}
    </div>
  )
}

function PerformanceView({ posts, curves }: { posts: XPostTableRow[]; curves: Record<string, XCurvePoint[]> }) {
  const [open, setOpen] = useState<string | null>(null)
  const totalImpressions = posts.reduce((s, p) => s + (p.metrics.impressions ?? 0), 0)
  const top = posts.reduce<XPostTableRow | null>((best, p) => (!best || (p.metrics.impressions ?? 0) > (best.metrics.impressions ?? 0) ? p : best), null)
  const rates = posts.map((p) => p.engagementRate).filter((v): v is number => v !== null)
  const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Hero label="Impressões (total)" value={int(totalImpressions)} />
        <Hero label="Top post" value={top ? int(top.metrics.impressions) : "—"} />
        <Hero label="Engajamento médio" value={pct(avgRate)} hint="(likes+reposts+replies+quotes+bookmarks)/impressions" />
      </div>

      <table className="w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr>
            <th className="py-1">Post</th><th>Data</th><th>Impr.</th><th>Likes</th><th>Reposts</th><th>Replies</th><th>Quotes</th><th>Bkmk</th><th>Eng.</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => (
            <tr key={p.tweetId} className="cursor-pointer border-t border-zinc-800 text-zinc-300 hover:bg-zinc-800/40" onClick={() => setOpen(open === p.tweetId ? null : p.tweetId)}>
              <td className="max-w-[280px] truncate py-1">
                <a href={p.url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline" onClick={(e) => e.stopPropagation()}>↗</a>{" "}
                {p.text}
              </td>
              <td>{p.postedAt.slice(0, 10)}</td>
              <td>{int(p.metrics.impressions)}</td><td>{int(p.metrics.likes)}</td><td>{int(p.metrics.reposts)}</td>
              <td>{int(p.metrics.replies)}</td><td>{int(p.metrics.quotes)}</td><td>{int(p.metrics.bookmarks)}</td>
              <td>{pct(p.engagementRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {open && curves[open] && (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="mb-2 text-xs text-zinc-500">Curva diária — {open}</div>
          <ChartContainer config={curveConfig} className="h-[240px] w-full">
            <LineChart data={curves[open]}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={56} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {(["impressions", "likes", "reposts"] as const).map((k) => (
                <Line key={k} type="monotone" dataKey={k} stroke={`var(--color-${k})`} dot={false} strokeWidth={2} />
              ))}
            </LineChart>
          </ChartContainer>
        </div>
      )}
    </div>
  )
}

function AttributionView({ attribution, protocolSeries }: { attribution: AttributionRow[]; protocolSeries: SeriesPoint[] }) {
  const [metric, setMetric] = useState<keyof typeof protocolConfig>("dieselHolders")
  return (
    <div>
      <p className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400">
        ⚠️ Exploratório — <span className="text-zinc-200">sinal, não prova</span>. Vários posts/dia + ruído de mercado tornam atribuição causal impossível.
      </p>

      <div className="mb-2 flex flex-wrap gap-1">
        {(Object.keys(protocolConfig) as (keyof typeof protocolConfig)[]).map((m) => (
          <button key={m} onClick={() => setMetric(m)} className={`rounded-md px-3 py-1.5 text-sm ${metric === m ? "bg-sky-600 text-white" : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}>
            {protocolConfig[m].label}
          </button>
        ))}
      </div>

      {protocolSeries.length > 0 && (
        <ChartContainer config={protocolConfig} className="mb-6 h-[280px] w-full">
          <LineChart data={protocolSeries}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={64} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="monotone" dataKey={metric} stroke={`var(--color-${metric})`} dot={false} strokeWidth={2} />
            {attribution.map((a) => (
              <ReferenceLine key={a.tweetId} x={a.postedAt.slice(0, 10)} stroke="#71717a" strokeDasharray="3 3" />
            ))}
          </LineChart>
        </ChartContainer>
      )}

      <table className="w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr>
            <th className="py-1">Post</th><th>Data</th><th>Eng.</th>
            <th>Δhold 1d</th><th>3d</th><th>7d</th><th>ΔBTC 1d</th><th>3d</th><th>7d</th>
          </tr>
        </thead>
        <tbody>
          {attribution.map((a) => (
            <tr key={a.tweetId} className="border-t border-zinc-800 text-zinc-300">
              <td className="max-w-[240px] truncate py-1">{a.text}</td>
              <td>{a.postedAt.slice(0, 10)}</td><td>{pct(a.engagementRate)}</td>
              <td>{delta(a.holders.d1)}</td><td>{delta(a.holders.d3)}</td><td>{delta(a.holders.d7)}</td>
              <td>{delta(a.btcLocked.d1)}</td><td>{delta(a.btcLocked.d3)}</td><td>{delta(a.btcLocked.d7)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Hero({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="text-xs text-zinc-500" title={hint}>{label}</div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/cms/x-analytics-client.test.tsx`
Expected: PASS (3 tests). (recharts may emit width/height warnings under happy-dom — assertions are on text, so they pass.)

- [ ] **Step 5: Full typecheck + suite + build**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (the page from Task 6 now resolves `XAnalyticsClient`).

Run: `pnpm test`
Expected: PASS except the ~12 pre-existing integration live-RPC tests (`tests/integration/{block-range-data,blockchain-data,btc-locked-debug}`) that fail offline — NOT a regression.

Run: `pnpm build`
Expected: success (an `EINVAL copyfile` warning on Windows is benign, exit 0). If `tsc` reports a phantom route error after branch switches, run `rm -rf .next` and rebuild.

- [ ] **Step 6: Commit**

```bash
git add components/cms/marketing/XAnalyticsClient.tsx tests/cms/x-analytics-client.test.tsx
git commit -m "feat(x-analytics): client component (Performance + Atribuição) + verde tsc/test/build"
```

---

### Task 8: Deploy wiring (scheduler + ESO secrets)

**Files:**
- Modify: `.github/workflows/deploy.yml` (add a `Setup X Engagement Scheduler` step, mirroring `Setup Daily Snapshot Scheduler`)
- Modify: `k8s/external-secrets.yaml` (add `X_BEARER_TOKEN`; add `PREFETCH_SECRET` so the GKE pod gates the crons — closes the open-endpoint chip)

**Interfaces:**
- Consumes: `secrets.PREFETCH_SECRET` (existing GH secret); GCP Secret Manager keys `x-bearer-token` and `prefetch-secret` (must exist — see manual prereq below).
- Produces: a daily Cloud Scheduler job hitting `/api/marketing/x-cron`; `X_BEARER_TOKEN` + `PREFETCH_SECRET` injected into the GKE pod via ESO.

> **No unit test** (infra/config). Verification is by review + the post-deploy curl checks below. This task is human-owned (merge/deploy) — confirm with the Vitor before applying.

- [ ] **Step 1: Add the scheduler step to `.github/workflows/deploy.yml`**

Mirror the existing `Setup Daily Snapshot Scheduler` block (schedule `15 0 * * *` to run 10 min after the protocol snapshot so the DAILY series exists first):

```yaml
      - name: Setup X Engagement Scheduler
        if: ${{ env.PREFETCH_SECRET != '' }}
        continue-on-error: true
        run: |
          gcloud services enable cloudscheduler.googleapis.com --quiet

          if gcloud scheduler jobs describe subfrost-x-engagement --location=${{ env.REGION }} > /dev/null 2>&1; then
            gcloud scheduler jobs delete subfrost-x-engagement --location=${{ env.REGION }} --quiet
          fi

          SERVICE_URL=$(gcloud run services describe ${{ env.SERVICE_NAME }} \
            --region=${{ env.REGION }} \
            --format='value(status.url)')

          gcloud scheduler jobs create http subfrost-x-engagement \
            --location=${{ env.REGION }} \
            --schedule="15 0 * * *" \
            --uri="${SERVICE_URL}/api/marketing/x-cron" \
            --http-method=GET \
            --headers="Authorization=Bearer ${{ secrets.PREFETCH_SECRET }}" \
            --time-zone="UTC" \
            --attempt-deadline="540s" \
            --description="Captures X post public_metrics daily at 00:15 UTC"

          echo "X engagement scheduler job created/updated"
```

- [ ] **Step 2: Add secrets to `k8s/external-secrets.yaml`**

Under `spec.data` of the `subfrost-io-secrets` ExternalSecret, add:

```yaml
    - secretKey: X_BEARER_TOKEN
      remoteRef:
        key: x-bearer-token
    - secretKey: PREFETCH_SECRET
      remoteRef:
        key: prefetch-secret
```

- [ ] **Step 3: Verify the YAML parses and the keys are present**

Run: `pnpm exec js-yaml k8s/external-secrets.yaml > /dev/null && echo OK` (or any YAML linter available; if none, visually confirm indentation matches sibling entries).
Run: `git grep -n "X_BEARER_TOKEN\|PREFETCH_SECRET" k8s/external-secrets.yaml`
Expected: both keys listed under the data array.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml k8s/external-secrets.yaml
git commit -m "chore(x-analytics): scheduler diário + ESO (X_BEARER_TOKEN + PREFETCH_SECRET no GKE)"
```

- [ ] **Step 5: Manual prerequisites + post-deploy verification (human-owned, do NOT run from Windows)**

Prereqs in GCP Secret Manager (someone with access; the Bearer waits on the X dev-account signup — see spec §13):
- `gcloud secrets create prefetch-secret --data-file=-` (value = the same `PREFETCH_SECRET` used by the schedulers)
- `gcloud secrets create x-bearer-token --data-file=-` (value = the X app-only Bearer, once the dev account is signed)

Post-deploy checks:
- `curl -sS -o /dev/null -w "%{http_code}" https://subfrost.io/admin/marketing/x` → **307** (gated redirect)
- Home `200`.
- Trigger backfill once the Bearer is live: `curl -H "Authorization: Bearer $PREFETCH_SECRET" "https://subfrost.io/api/marketing/x-cron?backfill=1"` → `{ ok:true, captured:N, ... }`.
- Before the Bearer exists, the same call returns `{ ok:true, skipped:"not_configured" }` (degraded, expected).

---

## Self-Review

**1. Spec coverage** (each spec section → task):
- §2 decisões ①–⑦ → ① seletor (Task 7) · ② todos+marca schedule (Tasks 3 `updateMatchedPushMetrics`, 7 — *nota:* o badge "do schedule" na tabela é cosmético; ver gap abaixo) · ③ série diária (Tasks 2/3/5) · ④ janela 7d + backfill (Task 5) · ⑤ MarketingSnapshot X_POST (Task 3) · ⑥ Δ1d/3d/7d (Task 2) · ⑦ handle (Task 1).
- §3 campos da API → Task 1 (`mapApiTweetToPayload`).
- §4 arquitetura 3 camadas → Tasks 5 (cron) + 6 (page) + 7 (client).
- §5 modelo de dados / identidade / matching → Tasks 1 (`extractTweetId`) + 3.
- §6 ingestão (cron, backfill, idempotência, UTC) → Tasks 4 + 5.
- §7 segurança (X_BEARER_TOKEN, PREFETCH_SECRET via ESO, degradação) → Tasks 5 (degrada) + 8 (ESO).
- §8 UI (aba, seletor, 2 visões, engagement rate, deltas, caveat) → Tasks 6 + 7.
- §9 erros/edge → Task 5 (try/catch por post, partial) + Task 1 (nulls).
- §10 testes → cada task tem testes; mock prisma local + fetch mockado; sem API real.
- §11 fora de escopo → respeitado (sem métricas privadas/escrita).
- §12 deploy → Task 8.
- §14 critérios → Task 7 Step 5 (tsc/test/build) + Task 8 Step 5 (curls).

**Gap encontrado e corrigido:** o spec §8.1 pede **badge "do schedule"** e **toggle "só do schedule"** na tabela de Performance. O design da Task 7 acima não expõe o vínculo push↔post ao client (a Task 3 só atualiza `MarketingPush.metrics`, não devolve "quais tweetIds têm push"). **Correção:** ver Task 6 addendum abaixo — a page passa um `Set<string>` de tweetIds que têm push casado, e a Task 7 usa pra um badge + toggle. Adicionado como Step extra para não quebrar o fluxo TDD.

**2. Placeholder scan:** sem TBD/TODO; todo step com código real ou comando real. ✓
**3. Type consistency:** `XPostSnapshotRow` é declarado em `x-series.ts` (Task 2) e re-exportado por `x-store.ts` (Task 3) — mesma forma estrutural; `XPostMetrics`/`XPostSnapshotPayload` de `x-types.ts` usados consistentemente; `mapApiTweetToPayload` assinatura idêntica em Task 1 e nos mocks da Task 5. ✓

---

### Task 6 — Addendum (fecha o gap do badge/toggle "do schedule")

**Files:**
- Modify: `lib/marketing/x-store.ts` (add `listMatchedTweetIds()`)
- Modify: `app/admin/marketing/x/page.tsx` (pass `scheduledTweetIds`)
- Modify: `components/cms/marketing/XAnalyticsClient.tsx` (badge + toggle)
- Test: extend `tests/marketing/x-store.test.ts` and `tests/cms/x-analytics-client.test.tsx`

- [ ] **Step A1: Failing test for `listMatchedTweetIds` (append to `tests/marketing/x-store.test.ts`)**

```ts
describe("listMatchedTweetIds", () => {
  it("returns the set of tweetIds that have an X push", async () => {
    vi.mocked(prisma.marketingPush.findMany).mockResolvedValueOnce([
      { refUrl: "https://x.com/subfrost_news/status/999" },
      { refUrl: "https://example.com/x" },
    ] as never)
    const { listMatchedTweetIds } = await import("@/lib/marketing/x-store")
    const set = await listMatchedTweetIds()
    expect(set.has("999")).toBe(true)
    expect(set.size).toBe(1)
  })
})
```

- [ ] **Step A2: Run → fails** (`listMatchedTweetIds` not exported).

Run: `pnpm exec vitest run tests/marketing/x-store.test.ts`

- [ ] **Step A3: Add `listMatchedTweetIds` to `lib/marketing/x-store.ts`**

```ts
export async function listMatchedTweetIds(): Promise<Set<string>> {
  const pushes = (await prisma.marketingPush.findMany({
    where: { channel: "X", refUrl: { not: null } },
    select: { refUrl: true },
  })) as { refUrl: string | null }[]
  const set = new Set<string>()
  for (const p of pushes) {
    const tid = extractTweetId(p.refUrl)
    if (tid) set.add(tid)
  }
  return set
}
```

- [ ] **Step A4: Run → passes.**

- [ ] **Step A5: Wire into the page** — in `app/admin/marketing/x/page.tsx`, import and call it, and pass to the client:

```tsx
import { listXPostSnapshots, listMatchedTweetIds } from "@/lib/marketing/x-store"
// ...
const [xRows, dailyRows, scheduledTweetIds] = await Promise.all([
  listXPostSnapshots(), listDailySnapshots(), listMatchedTweetIds(),
])
// ...
return (
  <XAnalyticsClient
    posts={posts} curves={curves} attribution={attribution}
    protocolSeries={protocolSeries} configured={configured}
    scheduledTweetIds={[...scheduledTweetIds]}
  />
)
```

- [ ] **Step A6: Add badge + toggle to the client** — update the props type and `PerformanceView`:

In `XAnalyticsClient` props add `scheduledTweetIds: string[]` and forward `const scheduled = new Set(scheduledTweetIds)` into `PerformanceView` (add the prop). In `PerformanceView` add state and filter:

```tsx
// props: { posts, curves, scheduled }: { ...; scheduled: Set<string> }
const [onlyScheduled, setOnlyScheduled] = useState(false)
const shown = onlyScheduled ? posts.filter((p) => scheduled.has(p.tweetId)) : posts
```

Add the toggle above the table:

```tsx
<label className="mb-2 flex items-center gap-2 text-sm text-zinc-400">
  <input type="checkbox" checked={onlyScheduled} onChange={(e) => setOnlyScheduled(e.target.checked)} />
  Só do schedule
</label>
```

Render the badge in the Post cell (after the text) and iterate `shown` instead of `posts`:

```tsx
{scheduled.has(p.tweetId) && <span className="ml-2 rounded bg-sky-900/60 px-1.5 py-0.5 text-xs text-sky-300">schedule</span>}
```

Update the default `XAnalyticsClient` call site in `PerformanceView` usage: `<PerformanceView posts={posts} curves={curves} scheduled={new Set(scheduledTweetIds)} />`.

- [ ] **Step A7: Extend the client test**

```tsx
it("shows the schedule badge for matched posts", () => {
  render(<XAnalyticsClient posts={[post]} curves={curves} attribution={attribution} protocolSeries={[]} configured scheduledTweetIds={["999"]} />)
  expect(screen.getByText("schedule")).toBeInTheDocument()
})
```

Update the other client tests to pass `scheduledTweetIds={[]}`.

- [ ] **Step A8: Run client test + full suite**

Run: `pnpm exec vitest run tests/cms/x-analytics-client.test.tsx tests/marketing/x-store.test.ts`
Expected: PASS.

- [ ] **Step A9: Commit**

```bash
git add lib/marketing/x-store.ts app/admin/marketing/x/page.tsx components/cms/marketing/XAnalyticsClient.tsx tests/
git commit -m "feat(x-analytics): badge + toggle 'do schedule' (vínculo push↔post)"
```

---

## Execution order note

Implement in task order **1 → 2 → 3 → 4 → 5 → 6 → 7 → 6-Addendum → 8**. The page (Task 6 Step 5) imports the client created in Task 7, so run the full `tsc`/`build` only at Task 7 Step 5 (and again after the 6-Addendum). Task 8 is human-owned (merge/deploy) and waits on the X dev-account Bearer for the live backfill — everything else merges and runs inert (degraded) until then.
