# Marketing — Engagement Analytics (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Site analytics" page under the `/admin` Marketing section that reads GA4 (property `G-0RV3B8BK4B`) via the GA4 Data API and visualizes visitors-over-time, top pages, traffic sources, and per-article engagement, with a date-range selector.

**Architecture:** A gated server page fetches a normalized `AnalyticsDashboard` from a source boundary (`AnalyticsSource`). The GA4 adapter mints a Google access token from a service-account JSON using `jose` (no heavy deps), runs four `runReport` calls (each wrapped in a ~15min Redis cache via `cacheGetOrCompute`), and normalizes the responses. Elasticsearch is a future second adapter behind the same boundary. Degrades gracefully (a "not configured" banner) when GA env vars are absent.

**Tech Stack:** Next.js 16 App Router (RSC + client island), `jose` (already a dep) for JWT, raw REST to `analyticsdata.googleapis.com`, `@/lib/redis` (`cacheGetOrCompute`), recharts 2.15 via `@/components/ui/chart`, Prisma (article title join), zod v3, vitest happy-dom. Spec: `docs/superpowers/specs/2026-06-24-marketing-engagement-analytics-design.md`.

## Global Constraints

- Branch → PR → merge. Never push to `main`. Never `git add` `.claude/`, `.npmrc`, or `.superpowers/`.
- No new Prisma schema. No new npm dependency (use `jose`, already present; raw REST). No warmer/cron.
- Gating: reuse the existing `marketing.view` privilege (read off `currentUser().privileges`). Page pattern: `currentUser()` → `redirect("/admin/login")` if no user → `redirect("/admin")` if `!me.privileges.includes("marketing.view")`.
- GA4 property env: `GA4_PROPERTY_ID` (numeric id) + `GA_SERVICE_ACCOUNT_JSON` (full SA JSON). When either is missing → `isAnalyticsConfigured()` is false; the dashboard returns `configured: false` with empty sections and never throws/calls the network.
- Every fetch/normalizer is guarded: a failed report or token yields an empty/zeroed result, never throws.
- Cache: `cacheGetOrCompute(key, fn, ttlSeconds)` from `@/lib/redis`; TTL `900` (15min); key `analytics:<report>:<rangeKey>`.
- `import prisma from "@/lib/prisma"` (default). Test mock: `vi.mock("@/lib/prisma", () => ({ prisma: client, default: client }))`.
- zod v3. vitest happy-dom. Gates before commit: `npx tsc --noEmit` 0, `CI=true npx vitest run` green. The final UI task also runs `npx next build` (0).
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Windows + Git Bash; use the Bash tool for `npx`.

---

### Task 1: Shared types, date ranges, config check

**Files:**
- Create: `lib/analytics/source.ts`
- Create: `lib/analytics/range.ts`
- Test: `tests/analytics/range.test.ts`

**Interfaces:**
- Produces (from `source.ts`): types `DateRange = { start: string; end: string; preset: string }`; `VisitorPoint`, `VisitorsSeries`, `TopPageRow`, `TrafficSourceRow`, `ArticleEngagementRow`, `AnalyticsDashboard`, `AnalyticsSource`; `isAnalyticsConfigured(): boolean`; `emptyDashboard(range: DateRange): AnalyticsDashboard`.
- Produces (from `range.ts`): `parseRange(preset?: string): DateRange`; `rangeKey(r: DateRange): string`; `RANGE_PRESETS: string[]`.

- [ ] **Step 1: Create `lib/analytics/source.ts`**

```ts
// Normalized analytics shapes + the source boundary. GA4 is the first adapter
// (lib/analytics/ga4.ts); an Elasticsearch adapter can implement the same
// AnalyticsSource later without touching the UI.

export interface DateRange { start: string; end: string; preset: string }

export interface VisitorPoint { date: string; activeUsers: number; sessions: number; pageViews: number }
export interface VisitorsSeries {
  points: VisitorPoint[]
  totals: { activeUsers: number; sessions: number; pageViews: number }
}
export interface TopPageRow { path: string; title: string | null; pageViews: number }
export interface TrafficSourceRow { channel: string; source: string | null; campaign: string | null; sessions: number }
export interface ArticleEngagementRow {
  slug: string; title: string | null; path: string; pageViews: number; avgEngagementSeconds: number | null
}

export interface AnalyticsDashboard {
  range: DateRange
  visitors: VisitorsSeries
  topPages: TopPageRow[]
  trafficSources: TrafficSourceRow[]
  articleEngagement: ArticleEngagementRow[]
  configured: boolean
}

export interface AnalyticsSource {
  getDashboard(range: DateRange): Promise<AnalyticsDashboard>
}

/** GA4 is configured only when both env vars are present. */
export function isAnalyticsConfigured(): boolean {
  return Boolean(process.env.GA4_PROPERTY_ID && process.env.GA_SERVICE_ACCOUNT_JSON)
}

/** A fully-empty dashboard (used when unconfigured or on total failure). */
export function emptyDashboard(range: DateRange): AnalyticsDashboard {
  return {
    range,
    visitors: { points: [], totals: { activeUsers: 0, sessions: 0, pageViews: 0 } },
    topPages: [],
    trafficSources: [],
    articleEngagement: [],
    configured: isAnalyticsConfigured(),
  }
}
```

- [ ] **Step 2: Write the failing test `tests/analytics/range.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { parseRange, rangeKey, RANGE_PRESETS } from "@/lib/analytics/range"

describe("parseRange", () => {
  it("maps known presets to GA4 relative date strings", () => {
    expect(parseRange("7d")).toEqual({ start: "7daysAgo", end: "today", preset: "7d" })
    expect(parseRange("28d")).toEqual({ start: "28daysAgo", end: "today", preset: "28d" })
    expect(parseRange("90d")).toEqual({ start: "90daysAgo", end: "today", preset: "90d" })
  })
  it("defaults to 28d for unknown/missing presets", () => {
    expect(parseRange(undefined).preset).toBe("28d")
    expect(parseRange("garbage").preset).toBe("28d")
  })
  it("parses a custom ISO range 'custom:START..END'", () => {
    expect(parseRange("custom:2026-05-01..2026-05-31")).toEqual({ start: "2026-05-01", end: "2026-05-31", preset: "custom" })
  })
  it("rejects a malformed custom range → default 28d", () => {
    expect(parseRange("custom:nope").preset).toBe("28d")
  })
})

describe("rangeKey", () => {
  it("is stable and range-specific", () => {
    expect(rangeKey(parseRange("7d"))).toBe("7daysAgo_today")
    expect(rangeKey({ start: "2026-05-01", end: "2026-05-31", preset: "custom" })).toBe("2026-05-01_2026-05-31")
  })
})

it("exposes the preset list", () => {
  expect(RANGE_PRESETS).toEqual(["7d", "28d", "90d"])
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `CI=true npx vitest run tests/analytics/range.test.ts`
Expected: FAIL — cannot find module `@/lib/analytics/range`.

- [ ] **Step 4: Implement `lib/analytics/range.ts`**

```ts
import type { DateRange } from "@/lib/analytics/source"

export const RANGE_PRESETS = ["7d", "28d", "90d"] as const

const PRESET_DAYS: Record<string, number> = { "7d": 7, "28d": 28, "90d": 90 }
const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Resolve a `?range=` value to a GA4 DateRange. Presets map to relative
 *  GA4 strings ("28daysAgo".."today"); "custom:START..END" takes ISO dates.
 *  Anything unrecognized falls back to 28d. Never throws. */
export function parseRange(preset?: string): DateRange {
  if (preset && preset.startsWith("custom:")) {
    const [start, end] = preset.slice("custom:".length).split("..")
    if (ISO.test(start ?? "") && ISO.test(end ?? "")) return { start, end, preset: "custom" }
    return { start: "28daysAgo", end: "today", preset: "28d" }
  }
  const days = preset && PRESET_DAYS[preset]
  if (days) return { start: `${days}daysAgo`, end: "today", preset }
  return { start: "28daysAgo", end: "today", preset: "28d" }
}

/** Cache-key fragment for a range. */
export function rangeKey(r: DateRange): string {
  return `${r.start}_${r.end}`
}
```

- [ ] **Step 5: Run test + typecheck**

Run: `CI=true npx vitest run tests/analytics/range.test.ts && npx tsc --noEmit`
Expected: PASS, tsc 0.

- [ ] **Step 6: Commit**

```bash
git add lib/analytics/source.ts lib/analytics/range.ts tests/analytics/range.test.ts
git commit -m "feat(analytics): normalized shapes + date-range parsing + config check"
```

---

### Task 2: Google access token (jose)

**Files:**
- Create: `lib/analytics/google-auth.ts`
- Test: `tests/analytics/google-auth.test.ts`

**Interfaces:**
- Consumes: `isAnalyticsConfigured` (Task 1).
- Produces: `getGoogleAccessToken(): Promise<string | null>` (mints + caches a GA-readonly access token from `GA_SERVICE_ACCOUNT_JSON`; null when unconfigured or on failure, never throws).

- [ ] **Step 1: Write the failing test `tests/analytics/google-auth.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock jose so we don't need a real RSA key in the test.
vi.mock("jose", () => ({
  importPKCS8: vi.fn().mockResolvedValue({} as never),
  SignJWT: class {
    setProtectedHeader() { return this }
    setIssuer() { return this }
    setSubject() { return this }
    setAudience() { return this }
    setIssuedAt() { return this }
    setExpirationTime() { return this }
    async sign() { return "signed.jwt.token" }
    constructor(_: unknown) {}
  },
}))

import { getGoogleAccessToken } from "@/lib/analytics/google-auth"

const SA = JSON.stringify({ client_email: "sa@proj.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n" })

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.GA_SERVICE_ACCOUNT_JSON
  delete process.env.GA4_PROPERTY_ID
  vi.unstubAllGlobals()
})

it("returns null when unconfigured (no env)", async () => {
  expect(await getGoogleAccessToken()).toBeNull()
})

it("mints and returns an access token from the token endpoint", async () => {
  process.env.GA_SERVICE_ACCOUNT_JSON = SA
  process.env.GA4_PROPERTY_ID = "123456789"
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "ya29.fake", expires_in: 3600 }) })
  vi.stubGlobal("fetch", fetchMock)
  const tok = await getGoogleAccessToken()
  expect(tok).toBe("ya29.fake")
  expect(fetchMock).toHaveBeenCalledWith("https://oauth2.googleapis.com/token", expect.objectContaining({ method: "POST" }))
})

it("returns null on a token-endpoint error (never throws)", async () => {
  process.env.GA_SERVICE_ACCOUNT_JSON = SA
  process.env.GA4_PROPERTY_ID = "123456789"
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }))
  expect(await getGoogleAccessToken()).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/analytics/google-auth.test.ts`
Expected: FAIL — cannot find module `@/lib/analytics/google-auth`.

- [ ] **Step 3: Implement `lib/analytics/google-auth.ts`**

```ts
// Mints a Google OAuth access token (analytics.readonly) from a service-account
// JSON using jose (RS256 JWT → token endpoint), mirroring the repo's gcp_token.py
// tooling. Token is cached in-process until ~5 min before expiry. Never throws —
// returns null when unconfigured or on any failure (the dashboard degrades).
import { SignJWT, importPKCS8 } from "jose"
import { isAnalyticsConfigured } from "@/lib/analytics/source"

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly"

let cached: { token: string; expiresAt: number } | null = null

interface ServiceAccount { client_email: string; private_key: string }

export async function getGoogleAccessToken(): Promise<string | null> {
  if (!isAnalyticsConfigured()) return null
  if (cached && cached.expiresAt > Date.now()) return cached.token
  try {
    const sa = JSON.parse(process.env.GA_SERVICE_ACCOUNT_JSON as string) as ServiceAccount
    const key = await importPKCS8(sa.private_key, "RS256")
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(sa.client_email)
      .setSubject(sa.client_email)
      .setAudience(TOKEN_URL)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key)
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!data.access_token) return null
    const ttlMs = (data.expires_in ?? 3600) * 1000
    cached = { token: data.access_token, expiresAt: Date.now() + ttlMs - 5 * 60_000 }
    return cached.token
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `CI=true npx vitest run tests/analytics/google-auth.test.ts && npx tsc --noEmit`
Expected: PASS, tsc 0.

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/google-auth.ts tests/analytics/google-auth.test.ts
git commit -m "feat(analytics): GA access token via jose-signed service-account JWT"
```

---

### Task 3: GA4 runReport + visitors/topPages/trafficSources normalizers

**Files:**
- Create: `lib/analytics/ga4.ts`
- Test: `tests/analytics/ga4-reports.test.ts`

**Interfaces:**
- Consumes: `getGoogleAccessToken` (Task 2); types + `DateRange` (Task 1).
- Produces (exported for tests; assembled in Task 4): `runReport(body): Promise<GaReportResponse | null>`; `normalizeVisitors(res)`, `normalizeTopPages(res)`, `normalizeTrafficSources(res)`; type `GaRow`/`GaReportResponse`.

- [ ] **Step 1: Write the failing test `tests/analytics/ga4-reports.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { normalizeVisitors, normalizeTopPages, normalizeTrafficSources } from "@/lib/analytics/ga4"

const visitorsRes = {
  rows: [
    { dimensionValues: [{ value: "20260601" }], metricValues: [{ value: "100" }, { value: "120" }, { value: "300" }] },
    { dimensionValues: [{ value: "20260602" }], metricValues: [{ value: "50" }, { value: "60" }, { value: "150" }] },
  ],
}
const topPagesRes = {
  rows: [
    { dimensionValues: [{ value: "/articles/foo" }, { value: "Foo" }], metricValues: [{ value: "42" }] },
    { dimensionValues: [{ value: "/" }, { value: "Home" }], metricValues: [{ value: "10" }] },
  ],
}
const trafficRes = {
  rows: [
    { dimensionValues: [{ value: "Organic Search" }, { value: "google" }, { value: "(not set)" }], metricValues: [{ value: "200" }] },
  ],
}

it("normalizes visitors into points + summed totals", () => {
  const v = normalizeVisitors(visitorsRes)
  expect(v.points[0]).toEqual({ date: "20260601", activeUsers: 100, sessions: 120, pageViews: 300 })
  expect(v.totals).toEqual({ activeUsers: 150, sessions: 180, pageViews: 450 })
})

it("normalizes top pages", () => {
  const t = normalizeTopPages(topPagesRes)
  expect(t[0]).toEqual({ path: "/articles/foo", title: "Foo", pageViews: 42 })
})

it("normalizes traffic sources (mapping (not set) → null campaign)", () => {
  const s = normalizeTrafficSources(trafficRes)
  expect(s[0]).toEqual({ channel: "Organic Search", source: "google", campaign: null, sessions: 200 })
})

it("returns empty arrays / zero totals for an empty response (never throws)", () => {
  expect(normalizeVisitors({}).points).toEqual([])
  expect(normalizeVisitors({}).totals).toEqual({ activeUsers: 0, sessions: 0, pageViews: 0 })
  expect(normalizeTopPages({})).toEqual([])
  expect(normalizeTrafficSources({})).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/analytics/ga4-reports.test.ts`
Expected: FAIL — cannot find module `@/lib/analytics/ga4`.

- [ ] **Step 3: Implement the first half of `lib/analytics/ga4.ts`**

```ts
// GA4 Data API adapter. Raw runReport REST calls (bearer from google-auth) +
// normalizers into the shapes in source.ts. Every function is guarded; a missing
// token, HTTP error, or malformed body yields an empty/zeroed result, never throws.
import { getGoogleAccessToken } from "@/lib/analytics/google-auth"
import type { VisitorsSeries, TopPageRow, TrafficSourceRow } from "@/lib/analytics/source"

const DATA_API = "https://analyticsdata.googleapis.com/v1beta"

export interface GaRow { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }
export interface GaReportResponse { rows?: GaRow[] }

const num = (v: string | undefined): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const str = (v: string | undefined): string | null => (v && v !== "(not set)" ? v : null)

export async function runReport(body: Record<string, unknown>): Promise<GaReportResponse | null> {
  const token = await getGoogleAccessToken()
  const propertyId = process.env.GA4_PROPERTY_ID
  if (!token || !propertyId) return null
  try {
    const res = await fetch(`${DATA_API}/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    return (await res.json()) as GaReportResponse
  } catch {
    return null
  }
}

export function normalizeVisitors(res: GaReportResponse | null): VisitorsSeries {
  const rows = res?.rows ?? []
  const points = rows.map((r) => ({
    date: r.dimensionValues?.[0]?.value ?? "",
    activeUsers: num(r.metricValues?.[0]?.value),
    sessions: num(r.metricValues?.[1]?.value),
    pageViews: num(r.metricValues?.[2]?.value),
  }))
  const totals = points.reduce(
    (acc, p) => ({
      activeUsers: acc.activeUsers + p.activeUsers,
      sessions: acc.sessions + p.sessions,
      pageViews: acc.pageViews + p.pageViews,
    }),
    { activeUsers: 0, sessions: 0, pageViews: 0 },
  )
  return { points, totals }
}

export function normalizeTopPages(res: GaReportResponse | null): TopPageRow[] {
  return (res?.rows ?? []).map((r) => ({
    path: r.dimensionValues?.[0]?.value ?? "",
    title: str(r.dimensionValues?.[1]?.value),
    pageViews: num(r.metricValues?.[0]?.value),
  }))
}

export function normalizeTrafficSources(res: GaReportResponse | null): TrafficSourceRow[] {
  return (res?.rows ?? []).map((r) => ({
    channel: r.dimensionValues?.[0]?.value ?? "",
    source: str(r.dimensionValues?.[1]?.value),
    campaign: str(r.dimensionValues?.[2]?.value),
    sessions: num(r.metricValues?.[0]?.value),
  }))
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `CI=true npx vitest run tests/analytics/ga4-reports.test.ts && npx tsc --noEmit`
Expected: PASS, tsc 0.

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/ga4.ts tests/analytics/ga4-reports.test.ts
git commit -m "feat(analytics): GA4 runReport + visitors/top-pages/traffic normalizers"
```

---

### Task 4: Article engagement + getDashboard (the GA4 source)

**Files:**
- Modify: `lib/analytics/ga4.ts` (append the article report, the slug join, the four cache-wrapped fetchers, and `ga4Source`)
- Test: `tests/analytics/ga4-dashboard.test.ts`

**Interfaces:**
- Consumes: the normalizers + `runReport` (Task 3); `cacheGetOrCompute` from `@/lib/redis`; `prisma`; types + `rangeKey` (Tasks 1).
- Produces: `parseArticleSlug(path): string | null`; `ga4Source: AnalyticsSource` (its `getDashboard(range)` returns a fully-normalized `AnalyticsDashboard`).

- [ ] **Step 1: Write the failing test `tests/analytics/ga4-dashboard.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const client = { article: { findMany: vi.fn() } }
vi.mock("@/lib/prisma", () => ({ prisma: client, default: client }))
// cacheGetOrCompute just runs the compute fn (no real cache in the test).
vi.mock("@/lib/redis", () => ({ cacheGetOrCompute: vi.fn((_k: string, fn: () => unknown) => fn()) }))
vi.mock("@/lib/analytics/google-auth", () => ({ getGoogleAccessToken: vi.fn().mockResolvedValue("tok") }))

import { parseArticleSlug, ga4Source } from "@/lib/analytics/ga4"

beforeEach(() => {
  vi.clearAllMocks()
  process.env.GA4_PROPERTY_ID = "123"
  process.env.GA_SERVICE_ACCOUNT_JSON = "{}"
})

describe("parseArticleSlug", () => {
  it("extracts the slug from an /articles/ path, ignoring query + locale", () => {
    expect(parseArticleSlug("/articles/hello-world")).toBe("hello-world")
    expect(parseArticleSlug("/articles/hello-world?lang=zh")).toBe("hello-world")
  })
  it("returns null for non-article paths", () => {
    expect(parseArticleSlug("/")).toBeNull()
    expect(parseArticleSlug("/articles")).toBeNull()
  })
})

it("getDashboard assembles four sections + joins article titles", async () => {
  const article = {
    rows: [{ dimensionValues: [{ value: "/articles/foo" }, { value: "Foo page" }], metricValues: [{ value: "40" }, { value: "200" }] }],
  }
  // runReport is called 4×; return the article shape only for the 4th (article) call,
  // empty for the others — we only assert the article join + configured here.
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => article }))
  client.article.findMany.mockResolvedValue([
    { translations: [{ title: "Foo (CMS)" }], slug: "foo" },
  ])

  const dash = await ga4Source.getDashboard({ start: "28daysAgo", end: "today", preset: "28d" })
  expect(dash.configured).toBe(true)
  const row = dash.articleEngagement.find((r) => r.slug === "foo")!
  expect(row.title).toBe("Foo (CMS)")        // CMS title wins over GA page title
  expect(row.pageViews).toBe(40)
  expect(row.avgEngagementSeconds).toBe(5)   // userEngagementDuration 200 / 40 pageViews
})

it("returns an empty unconfigured dashboard without network when env is absent", async () => {
  delete process.env.GA4_PROPERTY_ID
  delete process.env.GA_SERVICE_ACCOUNT_JSON
  const fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  const dash = await ga4Source.getDashboard({ start: "28daysAgo", end: "today", preset: "28d" })
  expect(dash.configured).toBe(false)
  expect(dash.articleEngagement).toEqual([])
  expect(fetchMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/analytics/ga4-dashboard.test.ts`
Expected: FAIL — `parseArticleSlug` / `ga4Source` not exported.

- [ ] **Step 3: Append to `lib/analytics/ga4.ts`**

Add these imports at the top of the file (merge with the existing import block):

```ts
import prisma from "@/lib/prisma"
import { cacheGetOrCompute } from "@/lib/redis"
import {
  type AnalyticsSource, type AnalyticsDashboard, type DateRange,
  type ArticleEngagementRow, isAnalyticsConfigured, emptyDashboard,
} from "@/lib/analytics/source"
import { rangeKey } from "@/lib/analytics/range"
```

Append at the end of the file:

```ts
const TTL = 900 // 15 min

/** "/articles/{slug}" → slug (strips query/hash). Non-article paths → null. */
export function parseArticleSlug(path: string): string | null {
  const m = path.match(/^\/articles\/([^/?#]+)/)
  return m ? m[1] : null
}

function dateRanges(r: DateRange) {
  return [{ startDate: r.start, endDate: r.end }]
}

async function fetchVisitors(r: DateRange) {
  return cacheGetOrCompute(`analytics:visitors:${rangeKey(r)}`, async () =>
    normalizeVisitors(
      await runReport({
        dateRanges: dateRanges(r),
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
    ), TTL)
}

async function fetchTopPages(r: DateRange) {
  return cacheGetOrCompute(`analytics:toppages:${rangeKey(r)}`, async () =>
    normalizeTopPages(
      await runReport({
        dateRanges: dateRanges(r),
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 20,
      }),
    ), TTL)
}

async function fetchTrafficSources(r: DateRange) {
  return cacheGetOrCompute(`analytics:traffic:${rangeKey(r)}`, async () =>
    normalizeTrafficSources(
      await runReport({
        dateRanges: dateRanges(r),
        dimensions: [{ name: "sessionDefaultChannelGroup" }, { name: "sessionSource" }, { name: "sessionCampaignName" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 20,
      }),
    ), TTL)
}

async function fetchArticleEngagement(r: DateRange): Promise<ArticleEngagementRow[]> {
  return cacheGetOrCompute(`analytics:articles:${rangeKey(r)}`, async () => {
    const res = await runReport({
      dateRanges: dateRanges(r),
      dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
      metrics: [{ name: "screenPageViews" }, { name: "userEngagementDuration" }],
      dimensionFilter: { filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: "/articles/" } } },
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 50,
    })
    const rows = (res?.rows ?? [])
      .map((row) => {
        const path = row.dimensionValues?.[0]?.value ?? ""
        const slug = parseArticleSlug(path)
        if (!slug) return null
        const pageViews = Number(row.metricValues?.[0]?.value) || 0
        const engagement = Number(row.metricValues?.[1]?.value) || 0
        return {
          slug, path,
          gaTitle: row.dimensionValues?.[1]?.value ?? null,
          pageViews,
          avgEngagementSeconds: pageViews > 0 ? engagement / pageViews : null,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    if (rows.length === 0) return []
    const articles = await prisma.article.findMany({
      where: { slug: { in: rows.map((x) => x.slug) } },
      select: { slug: true, translations: { select: { title: true }, take: 1 } },
    })
    const titleBySlug = new Map(articles.map((a) => [a.slug, a.translations[0]?.title ?? null]))
    return rows.map(({ gaTitle, ...x }) => ({ ...x, title: titleBySlug.get(x.slug) ?? gaTitle }))
  }, TTL)
}

export const ga4Source: AnalyticsSource = {
  async getDashboard(range: DateRange): Promise<AnalyticsDashboard> {
    if (!isAnalyticsConfigured()) return emptyDashboard(range)
    const [visitors, topPages, trafficSources, articleEngagement] = await Promise.all([
      fetchVisitors(range), fetchTopPages(range), fetchTrafficSources(range), fetchArticleEngagement(range),
    ])
    return { range, visitors, topPages, trafficSources, articleEngagement, configured: true }
  },
}
```

- [ ] **Step 4: Run test + typecheck + the Task-3 test (regression)**

Run: `CI=true npx vitest run tests/analytics/ga4-dashboard.test.ts tests/analytics/ga4-reports.test.ts && npx tsc --noEmit`
Expected: PASS, tsc 0.

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/ga4.ts tests/analytics/ga4-dashboard.test.ts
git commit -m "feat(analytics): article-engagement join + cached getDashboard (GA4 source)"
```

---

### Task 5: "Site analytics" nav leaf

**Files:**
- Modify: `lib/cms/admin-nav.ts` (add a leaf to the existing `marketing` group; add the icon import)
- Modify: `tests/cms/admin-nav.test.ts` IF it asserts the marketing group's item count/hrefs (the new leaf changes marketing from 1 → 2 items)
- Test: `tests/cms/analytics-nav.test.ts`

**Interfaces:**
- Consumes: `visibleNav` from `@/lib/cms/admin-nav`.
- Produces: a `/admin/marketing/analytics` leaf under the `marketing` group, gated `marketing.view`.

- [ ] **Step 1: Write the failing test `tests/cms/analytics-nav.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { visibleNav } from "@/lib/cms/admin-nav"

it("adds the Site analytics leaf to the Marketing group (gated marketing.view)", () => {
  const groups = visibleNav(["marketing.view"])
  const marketing = groups.find((g) => g.key === "marketing")!
  const hrefs = marketing.items.map((i) => i.href)
  expect(hrefs).toContain("/admin/marketing/snapshots")
  expect(hrefs).toContain("/admin/marketing/analytics")
  expect(visibleNav([]).find((g) => g.key === "marketing")).toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/cms/analytics-nav.test.ts`
Expected: FAIL — analytics href not in the marketing group.

- [ ] **Step 3: Implement**

In `lib/cms/admin-nav.ts`:
1. Add `BarChart3` to the existing `lucide-react` import (merge into the existing line; do not duplicate).
2. Add a leaf to the `marketing` group's `items` array (AFTER the "Protocol snapshots" leaf):

```ts
      { label: "Site analytics", href: "/admin/marketing/analytics", icon: BarChart3, privilege: "marketing.view" },
```

- [ ] **Step 4: Run the new test + the FULL suite (this touches a shared nav file)**

Run: `CI=true npx vitest run tests/cms/analytics-nav.test.ts && CI=true npx vitest run`
Expected: the new test PASSES. If `tests/cms/admin-nav.test.ts` now fails because it asserts the marketing group's exact item count or href list, update ONLY that assertion to include the new `/admin/marketing/analytics` leaf (this is a legitimate factual update — the marketing group genuinely has a second item now), then re-run the full suite to green. Run `npx tsc --noEmit` (0).

- [ ] **Step 5: Commit**

```bash
git add lib/cms/admin-nav.ts tests/cms/analytics-nav.test.ts
# include tests/cms/admin-nav.test.ts only if you updated its assertion:
git add tests/cms/admin-nav.test.ts 2>/dev/null || true
git commit -m "feat(analytics): Site analytics nav leaf"
```

---

### Task 6: AnalyticsClient (UI + charts)

**Files:**
- Create: `components/cms/marketing/AnalyticsClient.tsx`
- Test: `tests/marketing/analytics-client.test.tsx`

**Interfaces:**
- Consumes: `AnalyticsDashboard` + `RANGE_PRESETS` (Tasks 1); recharts via `@/components/ui/chart`; `useRouter`/`useSearchParams` from `next/navigation`.
- Produces: `AnalyticsClient({ dashboard }: { dashboard: AnalyticsDashboard })`.

- [ ] **Step 1: Write the failing test `tests/marketing/analytics-client.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

const push = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams("range=28d"),
  usePathname: () => "/admin/marketing/analytics",
}))

import { AnalyticsClient } from "@/components/cms/marketing/AnalyticsClient"
import type { AnalyticsDashboard } from "@/lib/analytics/source"

const base: AnalyticsDashboard = {
  range: { start: "28daysAgo", end: "today", preset: "28d" },
  visitors: { points: [{ date: "20260601", activeUsers: 100, sessions: 120, pageViews: 300 }], totals: { activeUsers: 100, sessions: 120, pageViews: 300 } },
  topPages: [{ path: "/articles/foo", title: "Foo", pageViews: 42 }],
  trafficSources: [{ channel: "Organic Search", source: "google", campaign: null, sessions: 200 }],
  articleEngagement: [{ slug: "foo", title: "Foo", path: "/articles/foo", pageViews: 40, avgEngagementSeconds: 5 }],
  configured: true,
}

beforeEach(() => { cleanup(); push.mockClear() })

it("renders the four sections with data", () => {
  const { getByText } = render(<AnalyticsClient dashboard={base} />)
  expect(getByText("100")).toBeTruthy()              // active users total chip
  expect(getByText("Organic Search")).toBeTruthy()   // traffic source row
  expect(getByText("Foo")).toBeTruthy()              // article/top-page title
})

it("shows the not-configured banner when configured is false", () => {
  const { getByText } = render(<AnalyticsClient dashboard={{ ...base, configured: false }} />)
  expect(getByText(/not configured/i)).toBeTruthy()
})

it("pushes a new range to the URL when a preset is clicked", () => {
  const { getByText } = render(<AnalyticsClient dashboard={base} />)
  fireEvent.click(getByText("7d"))
  expect(push).toHaveBeenCalledWith("/admin/marketing/analytics?range=7d")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/marketing/analytics-client.test.tsx`
Expected: FAIL — cannot find module `@/components/cms/marketing/AnalyticsClient`.

- [ ] **Step 3: Implement `components/cms/marketing/AnalyticsClient.tsx`**

```tsx
"use client"

import { useRouter, usePathname } from "next/navigation"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { RANGE_PRESETS } from "@/lib/analytics/range"
import type { AnalyticsDashboard } from "@/lib/analytics/source"

const fmt = (n: number) => n.toLocaleString("en-US")
const secs = (n: number | null) => (n === null ? "—" : `${Math.round(n)}s`)

const chartConfig: ChartConfig = {
  activeUsers: { label: "Active users", color: "#38bdf8" },
  sessions: { label: "Sessions", color: "#34d399" },
  pageViews: { label: "Pageviews", color: "#a78bfa" },
}

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-xl font-bold text-white">{fmt(value)}</div>
    </div>
  )
}

export function AnalyticsClient({ dashboard }: { dashboard: AnalyticsDashboard }) {
  const router = useRouter()
  const pathname = usePathname()
  const { visitors, topPages, trafficSources, articleEngagement, range } = dashboard

  const pick = (preset: string) => router.push(`${pathname}?range=${preset}`)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Site analytics</h1>
        <div className="flex gap-1">
          {RANGE_PRESETS.map((p) => (
            <button key={p} onClick={() => pick(p)}
              className={`rounded-md px-3 py-1.5 text-sm ${range.preset === p ? "bg-sky-600 text-white" : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {!dashboard.configured && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
          Analytics is not configured. Set <code>GA4_PROPERTY_ID</code> and <code>GA_SERVICE_ACCOUNT_JSON</code> (a service account with Analytics Viewer on property G-0RV3B8BK4B).
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Chip label="Active users" value={visitors.totals.activeUsers} />
        <Chip label="Sessions" value={visitors.totals.sessions} />
        <Chip label="Pageviews" value={visitors.totals.pageViews} />
      </div>

      {visitors.points.length > 0 && (
        <ChartContainer config={chartConfig} className="mb-6 h-[260px] w-full">
          <AreaChart data={visitors.points}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={48} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area type="monotone" dataKey="activeUsers" stroke="var(--color-activeUsers)" fill="var(--color-activeUsers)" fillOpacity={0.15} />
            <Area type="monotone" dataKey="sessions" stroke="var(--color-sessions)" fill="var(--color-sessions)" fillOpacity={0.1} />
            <Area type="monotone" dataKey="pageViews" stroke="var(--color-pageViews)" fill="var(--color-pageViews)" fillOpacity={0.1} />
          </AreaChart>
        </ChartContainer>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold text-white">Top pages</h2>
          {topPages.length === 0 ? <p className="text-sm text-zinc-500">No data.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-500"><tr><th className="py-1">Page</th><th>Views</th></tr></thead>
              <tbody>{topPages.map((p) => (
                <tr key={p.path} className="border-t border-zinc-800 text-zinc-300"><td className="py-1">{p.title ?? p.path}</td><td>{fmt(p.pageViews)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-white">Traffic sources</h2>
          {trafficSources.length === 0 ? <p className="text-sm text-zinc-500">No data.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-500"><tr><th className="py-1">Channel</th><th>Source</th><th>Sessions</th></tr></thead>
              <tbody>{trafficSources.map((s, i) => (
                <tr key={`${s.channel}-${s.source}-${i}`} className="border-t border-zinc-800 text-zinc-300"><td className="py-1">{s.channel}</td><td>{s.source ?? "—"}</td><td>{fmt(s.sessions)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </section>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 font-semibold text-white">Article engagement</h2>
        {articleEngagement.length === 0 ? <p className="text-sm text-zinc-500">No data.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500"><tr><th className="py-1">Article</th><th>Views</th><th>Avg engagement</th></tr></thead>
            <tbody>{articleEngagement.map((a) => (
              <tr key={a.slug} className="border-t border-zinc-800 text-zinc-300"><td className="py-1">{a.title ?? a.slug}</td><td>{fmt(a.pageViews)}</td><td>{secs(a.avgEngagementSeconds)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx vitest run tests/marketing/analytics-client.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/cms/marketing/AnalyticsClient.tsx tests/marketing/analytics-client.test.tsx
git commit -m "feat(analytics): AnalyticsClient dashboard UI + charts"
```

---

### Task 7: Server page + env + final gates

**Files:**
- Create: `app/admin/marketing/analytics/page.tsx`
- Modify: `.env.example` (document the two GA vars)
- (No new test file — the page is a thin gated server shell; covered by tsc + build. The gating mirrors the snapshot pages, already tested patterns.)

**Interfaces:**
- Consumes: `currentUser` (`@/lib/cms/authz`), `ga4Source` (Task 4), `parseRange` (Task 1), `AnalyticsClient` (Task 6).

- [ ] **Step 1: Implement `app/admin/marketing/analytics/page.tsx`**

```tsx
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { ga4Source } from "@/lib/analytics/ga4"
import { parseRange } from "@/lib/analytics/range"
import { AnalyticsClient } from "@/components/cms/marketing/AnalyticsClient"

export const dynamic = "force-dynamic"

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("marketing.view")) redirect("/admin")

  const { range: rangeParam } = await searchParams
  const range = parseRange(rangeParam)
  const dashboard = await ga4Source.getDashboard(range)
  return <AnalyticsClient dashboard={dashboard} />
}
```

- [ ] **Step 2: Add the env vars to `.env.example`**

Append (under a clear comment), matching the file's existing style:

```bash
# Marketing > Site analytics (GA4 Data API). Optional — the dashboard shows a
# "not configured" banner until both are set.
GA4_PROPERTY_ID=
GA_SERVICE_ACCOUNT_JSON=
```

- [ ] **Step 3: Full gates**

Run: `npx tsc --noEmit && CI=true npx vitest run && npx next build`
Expected: tsc 0; all tests green; build 0 (route `ƒ /admin/marketing/analytics` listed).

- [ ] **Step 4: Commit**

```bash
git add app/admin/marketing/analytics/page.tsx .env.example
git commit -m "feat(analytics): Site analytics server page + env example"
```

---

## Final verification (before PR)

- [ ] `npx tsc --noEmit` — 0
- [ ] `CI=true npx vitest run` — all green (new: range, google-auth, ga4-reports, ga4-dashboard, analytics-nav, analytics-client)
- [ ] `npx next build` — 0, route `ƒ /admin/marketing/analytics`
- [ ] Open PR `feat/marketing-engagement-analytics` → `main`.

## Deploy (human-owned, after merge)

1. Merge PR → Cloud Build produces `subfrost-io:<short-sha>`.
2. Bump `newTag` in `k8s/kustomization.yaml` via a deploy PR → merge.
3. Flux: reconcile `gitrepository/subfrost-io` (source) **before** `kustomization/subfrost-io`.
4. No schema/migration; no `/api/prefetch` change.
5. **Provision the GA secret** (external, flex / GA admin): create a service account, grant it **Analytics Viewer** on the GA4 property behind `G-0RV3B8BK4B`, get the numeric property id, and add `GA4_PROPERTY_ID` + `GA_SERVICE_ACCOUNT_JSON` to the k8s secret (the existing `anthropic-api-key` direct-secret pattern). Until then the page shows the not-configured banner.
6. Live check: `/admin/marketing/analytics` (307 unprivileged); as ADMIN it renders the not-configured banner pre-secret, real charts post-secret; `/api/health` 200.

## Spec coverage self-check

- Source boundary + normalized shapes: Task 1 (`source.ts`). ✓
- Hybrid (GA4 now, ES later): `AnalyticsSource` interface + `ga4Source` adapter (Tasks 1, 4); ES is a future adapter. ✓
- Auth via jose (no heavy dep): Task 2. ✓
- 4 reports (visitors/top-pages/traffic/article): Tasks 3–4. ✓
- Article slug→title join: Task 4. ✓
- Cache (cacheGetOrCompute, 15min): Task 4. ✓
- Date-range selector (7/28/90/custom, default 28d): Tasks 1, 6. ✓
- Gating marketing.view: Tasks 5, 7. ✓
- Graceful degradation (not-configured): Tasks 1, 4, 6. ✓
- Nav leaf: Task 5. ✓
- Secrets + .env.example + deploy: Task 7 + Deploy notes. ✓
- No schema / no warmer / no new dep: honored throughout. ✓
