# First-Party Analytics App Implementation Plan (Part B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture one access-event per public pageview from the tlsd `X-TLS-*` headers, read those events back from Elasticsearch through an `esSource`, and flip the "Site analytics" page off GA4 onto first-party data.

**Architecture:** A shared edge-safe telemetry module shapes + emits the strict `subfrost-cdn-*` access-event; the existing `middleware.ts` calls it per public pageview (`event.waitUntil`, fire-and-forget); `/api/fp` reuses it. `esSource` (mirroring `ga4Source`) runs guarded, cached ES aggregations — using **runtime fields that read `_source`** so they survive the heterogeneous per-index mappings — and normalizes into the existing `AnalyticsDashboard` shape. A tiny selector picks ES (default) or GA4 (`ANALYTICS_SOURCE=ga4`) so the UI is untouched.

**Tech Stack:** Next.js 16 App Router (Edge middleware + nodejs routes), TypeScript, Vitest, Prisma, `@/lib/redis` (`cacheGetOrCompute`), Elasticsearch 8.14.3 (`subfrost-cdn-*`).

## Global Constraints

- **The fingerprint always comes from tlsd** (already LIVE). Capture only *reads* the injected `X-TLS-JA4`/`X-TLS-JA3`/`X-TLS-JA3-Hash` headers. Migrating capture into tlsd is piece C (out of scope).
- **`subfrost-cdn-*` top-level template is `dynamic:strict`** — the event must carry exactly the template's top-level keys (missing OK, extra rejected). `referer`/`utm_*` go under `headers.*` (dynamic). The shipping shape is the one `app/api/fp/route.ts` already uses.
- **Mappings are heterogeneous across indices** (`ja4` is `keyword` in some, `text+keyword` in others; `path` likewise). All ES aggregations MUST use the `_source`-reading runtime fields in `RUNTIME_MAPPINGS` — never aggregate on `ja4`/`path`/`ja4.keyword` directly.
- **`parseRange` returns GA4-style strings** (`"28daysAgo"`, `"today"`) for presets — convert to ES date-math (`now-28d/d`, `now/d`) before querying ES.
- **Edge runtime** (middleware): no `os`/Node-only imports in any module the middleware pulls in (`lib/telemetry/*` must be edge-safe). `os.hostname()` only in the nodejs `/api/fp`.
- **Best-effort capture:** fire-and-forget, short timeout, swallow all errors; never block or fail a response.
- **Guarded reads:** every ES query returns null/empty on error; `esSource` never throws.
- **Tests:** `pnpm test <path>` (= `vitest run`). Mock app modules with `vi.mock('@/...')`. New tests under `tests/lib/...`.
- **TELEMETRY_ES_URL** default = `http://elasticsearch.telemetry.svc.cluster.local:9200` (already used by `/api/fp`).
- Branch: `feat/tlsd-first-party-analytics`. Merge/deploy human-owned (memory `always-pr-for-code-changes`); deploy = Flux `newTag` bump (quoted; full-SHA if Cloud Build short-SHA lags). No schema change.

---

### Task B1: Shared edge-safe telemetry module + `/api/fp` refactor

**Files:**
- Create: `lib/telemetry/access-event.ts`
- Modify: `app/api/fp/route.ts`
- Test: `tests/lib/telemetry/access-event.test.ts`

**Interfaces:**
- Produces: `TELEMETRY_ES_URL: string`; `AccessEventInput`, `AccessEvent` (types); `hasFingerprint(ja3,ja3_full,ja4): boolean`; `dailyIndex(d: Date): string`; `buildAccessEvent(input: AccessEventInput, now: Date): AccessEvent`; `emitAccessEvent(event: AccessEvent, esUrl?: string): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/telemetry/access-event.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { buildAccessEvent, dailyIndex, hasFingerprint } from "@/lib/telemetry/access-event"

const base = {
  ja3: "h", ja3_full: "f", ja4: "j", host: "subfrost.io", path: "/articles/x",
  method: "GET", status: 200, sourceIp: "1.2.3.4", userAgent: "UA", xff: "1.2.3.4",
  instance: "edge-middleware", latencyMs: 0,
}

describe("access-event", () => {
  it("dailyIndex formats UTC date", () => {
    expect(dailyIndex(new Date("2026-06-30T23:00:00Z"))).toBe("subfrost-cdn-2026.06.30")
  })
  it("hasFingerprint is true if any present, false if all empty", () => {
    expect(hasFingerprint("", "", "j")).toBe(true)
    expect(hasFingerprint("", "", "")).toBe(false)
  })
  it("buildAccessEvent shapes strict top-level + headers", () => {
    const e = buildAccessEvent({ ...base, referer: "https://x.com/s", utm: { utm_source: "tw" } }, new Date("2026-06-30T12:00:00Z"))
    expect(e.service).toBe("tlsd-ingress")
    expect(e.path).toBe("/articles/x")
    expect(e.source_ip).toBe("1.2.3.4")
    expect(e.ja4).toBe("j")
    expect(e.headers.referer).toBe("https://x.com/s")
    expect(e.headers.utm_source).toBe("tw")
    expect(e.headers["user-agent"]).toBe("UA")
    expect(e.bytes_out).toBe(0)
    expect(e.headers_truncated).toBe(false)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm test tests/lib/telemetry/access-event.test.ts`
Expected: FAIL — cannot resolve `@/lib/telemetry/access-event`.

- [ ] **Step 3: Implement the module**

Create `lib/telemetry/access-event.ts`:

```ts
// Edge-safe (NO `os`/Node-only imports): used by the Edge middleware AND the
// nodejs /api/fp route. Shapes the strict subfrost-cdn-* access event from the
// tlsd X-TLS-* headers + request context, and fire-and-forgets it to ES.

export const TELEMETRY_ES_URL = (
  process.env.TELEMETRY_ES_URL ||
  "http://elasticsearch.telemetry.svc.cluster.local:9200"
).replace(/\/$/, "")

export interface AccessEventInput {
  ja3: string; ja3_full: string; ja4: string
  host: string; path: string; method: string; status: number
  sourceIp: string; userAgent: string; xff: string
  referer?: string; utm?: Record<string, string>
  instance: string; latencyMs: number
}

export interface AccessEvent {
  ts: string; service: "tlsd-ingress"; instance: string
  host: string; path: string; method: string; status: number
  source_ip: string; ja3: string; ja3_full: string; ja4: string
  latency_ms: number; bytes_out: number
  headers: Record<string, string>; headers_truncated: boolean
}

export function hasFingerprint(ja3: string, ja3_full: string, ja4: string): boolean {
  return Boolean(ja3 || ja3_full || ja4)
}

export function dailyIndex(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `subfrost-cdn-${y}.${m}.${day}`
}

export function buildAccessEvent(input: AccessEventInput, now: Date): AccessEvent {
  const headers: Record<string, string> = {
    sni: input.host,
    "user-agent": input.userAgent,
    "x-forwarded-for": input.xff,
  }
  if (input.referer) headers.referer = input.referer
  if (input.utm) for (const [k, v] of Object.entries(input.utm)) if (v) headers[k] = v
  return {
    ts: now.toISOString(),
    service: "tlsd-ingress",
    instance: input.instance,
    host: input.host,
    path: input.path,
    method: input.method,
    status: input.status,
    source_ip: input.sourceIp,
    ja3: input.ja3,
    ja3_full: input.ja3_full,
    ja4: input.ja4,
    latency_ms: input.latencyMs,
    bytes_out: 0,
    headers,
    headers_truncated: false,
  }
}

export async function emitAccessEvent(event: AccessEvent, esUrl: string = TELEMETRY_ES_URL): Promise<void> {
  const index = dailyIndex(new Date(event.ts))
  try {
    await fetch(`${esUrl}/${index}/_doc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(2500),
    })
  } catch {
    // best-effort beacon: swallow all errors (network, timeout, 4xx/5xx)
  }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm test tests/lib/telemetry/access-event.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor `/api/fp/route.ts` to reuse the module**

Replace `app/api/fp/route.ts` with (keeps identical behavior; `instance` = `os.hostname()` in nodejs):

```ts
// app/api/fp/route.ts
// TLS-fingerprint beacon. Reads the tlsd-injected X-TLS-* headers, writes a
// subfrost-cdn-* access event (shared shaping in lib/telemetry/access-event),
// and returns the fingerprint as JSON. Drop-in for the old /upgrade beacon.
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import os from "os"
import { buildAccessEvent, emitAccessEvent, hasFingerprint } from "@/lib/telemetry/access-event"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clientIp(h: Headers): string {
  const xff = h.get("x-forwarded-for")
  if (xff) { const first = xff.split(",")[0]?.trim(); if (first) return first }
  return h.get("x-real-ip") || ""
}

export async function GET() {
  const start = Date.now()
  const h = await headers()
  const ja4 = h.get("x-tls-ja4") || ""
  const ja3_full = h.get("x-tls-ja3") || ""
  const ja3 = h.get("x-tls-ja3-hash") || ""
  const fingerprint = { ja3, ja3_full, ja4 }

  if (!hasFingerprint(ja3, ja3_full, ja4)) {
    return NextResponse.json({ fingerprint, captured: false }, { headers: { "cache-control": "no-store" } })
  }

  const event = buildAccessEvent({
    ja3, ja3_full, ja4,
    host: h.get("host") || "subfrost.io",
    path: "/api/fp", method: "GET", status: 200,
    sourceIp: clientIp(h),
    userAgent: h.get("user-agent") || "",
    xff: h.get("x-forwarded-for") || "",
    instance: os.hostname(),
    latencyMs: Date.now() - start,
  }, new Date())

  void emitAccessEvent(event)
  return NextResponse.json({ fingerprint, captured: true }, { headers: { "cache-control": "no-store" } })
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add lib/telemetry/access-event.ts app/api/fp/route.ts tests/lib/telemetry/access-event.test.ts
git commit -m "feat(telemetry): shared edge-safe access-event module; /api/fp reuses it"
```

---

### Task B2: Per-pageview capture in `middleware.ts`

**Files:**
- Create: `lib/telemetry/capture-path.ts`
- Modify: `middleware.ts`
- Test: `tests/lib/telemetry/capture-path.test.ts`, `tests/lib/telemetry/middleware-capture.test.ts`

**Interfaces:**
- Consumes: `buildAccessEvent`, `emitAccessEvent`, `hasFingerprint` (B1).
- Produces: `isCapturablePageview(pathname: string): boolean`.

- [ ] **Step 1: Write the failing matcher test**

Create `tests/lib/telemetry/capture-path.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { isCapturablePageview } from "@/lib/telemetry/capture-path"

describe("isCapturablePageview", () => {
  it("captures public pages", () => {
    for (const p of ["/", "/articles/foo", "/authors/bar", "/about"]) expect(isCapturablePageview(p)).toBe(true)
  })
  it("skips admin/api/internal/assets", () => {
    for (const p of ["/admin", "/admin/login", "/api/fp", "/api/stats", "/_next/static/x.js", "/favicon.ico", "/media/alkanes/btc.png", "/styles.css", "/broadcast"]) {
      expect(isCapturablePageview(p)).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm test tests/lib/telemetry/capture-path.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement the matcher**

Create `lib/telemetry/capture-path.ts`:

```ts
// Which request paths count as a public pageview worth capturing. Excludes the
// admin CMS, API routes, Next internals, broadcast, and static assets.
const SKIP_PREFIXES = ["/admin", "/api", "/_next", "/broadcast", "/favicon"]
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|map|txt|xml|json|woff2?|ttf|otf|mp4|webm|mp3|wav|pdf)$/i

export function isCapturablePageview(pathname: string): boolean {
  if (!pathname) return false
  for (const p of SKIP_PREFIXES) if (pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p)) return false
  if (ASSET_EXT.test(pathname)) return false
  return true
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm test tests/lib/telemetry/capture-path.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend `middleware.ts` with capture**

In `middleware.ts`:
1. Add imports at top:
```ts
import type { NextFetchEvent } from "next/server"
import { buildAccessEvent, emitAccessEvent, hasFingerprint } from "@/lib/telemetry/access-event"
import { isCapturablePageview } from "@/lib/telemetry/capture-path"
```
2. Change the signature to accept the fetch event and call capture first:
```ts
export async function middleware(request: NextRequest, event?: NextFetchEvent) {
  const { pathname } = request.nextUrl

  // First-party telemetry: one access event per public pageview, from the
  // tlsd-injected fingerprint. Fire-and-forget; never affects the response.
  capturePageview(request, event)
```
3. Add the helper (next to the other functions, e.g. before `redirectToLocale`):
```ts
function capturePageview(request: NextRequest, event?: NextFetchEvent) {
  if (!event) return
  const { pathname, searchParams } = request.nextUrl
  if (!isCapturablePageview(pathname)) return
  const h = request.headers
  const ja3 = h.get("x-tls-ja3-hash") || ""
  const ja3_full = h.get("x-tls-ja3") || ""
  const ja4 = h.get("x-tls-ja4") || ""
  if (!hasFingerprint(ja3, ja3_full, ja4)) return
  const xff = h.get("x-forwarded-for") || ""
  const utm: Record<string, string> = {}
  for (const k of ["utm_source", "utm_medium", "utm_campaign"]) {
    const v = searchParams.get(k); if (v) utm[k] = v
  }
  const ev = buildAccessEvent({
    ja3, ja3_full, ja4,
    host: h.get("host") || "subfrost.io",
    path: pathname,
    method: request.method,
    status: 200, // middleware runs before the handler; assume served
    sourceIp: xff.split(",")[0]?.trim() || h.get("x-real-ip") || "",
    userAgent: h.get("user-agent") || "",
    xff,
    referer: h.get("referer") || undefined,
    utm: Object.keys(utm).length ? utm : undefined,
    instance: "edge-middleware",
    latencyMs: 0,
  }, new Date())
  event.waitUntil(emitAccessEvent(ev))
}
```

- [ ] **Step 6: Write the capture integration test**

Create `tests/lib/telemetry/middleware-capture.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/cms/session", () => ({ SESSION_COOKIE: "sf_session", verifySession: vi.fn(async () => null) }))
const emit = vi.fn(async () => {})
vi.mock("@/lib/telemetry/access-event", async (orig) => ({ ...(await orig()), emitAccessEvent: emit }))

import { middleware } from "@/middleware"

function ev() { const calls: Promise<unknown>[] = []; return { waitUntil: (p: Promise<unknown>) => calls.push(p), calls } }

describe("middleware capture", () => {
  beforeEach(() => emit.mockClear())
  it("emits for a public pageview with a fingerprint", async () => {
    const req = new NextRequest("http://localhost/articles/foo", { headers: { "x-tls-ja4": "j", "x-forwarded-for": "9.9.9.9" } })
    const e = ev()
    await middleware(req, e as never)
    expect(emit).toHaveBeenCalledTimes(1)
    const arg = emit.mock.calls[0][0]
    expect(arg.path).toBe("/articles/foo")
    expect(arg.ja4).toBe("j")
  })
  it("does not emit without a fingerprint", async () => {
    const req = new NextRequest("http://localhost/articles/foo")
    await middleware(req, ev() as never)
    expect(emit).not.toHaveBeenCalled()
  })
  it("does not emit for /admin", async () => {
    const req = new NextRequest("http://localhost/admin", { headers: { "x-tls-ja4": "j" } })
    await middleware(req, ev() as never)
    expect(emit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 7: Run tests + typecheck + commit**

Run: `pnpm test tests/lib/telemetry/ && pnpm exec tsc --noEmit`
Expected: all PASS, no type errors. (The existing `tests/i18n/middleware-locale.test.ts` still passes — it calls `middleware(req)` with no event, and `capturePageview` no-ops when `event` is undefined.)

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add lib/telemetry/capture-path.ts middleware.ts tests/lib/telemetry/capture-path.test.ts tests/lib/telemetry/middleware-capture.test.ts
git commit -m "feat(telemetry): capture one access-event per public pageview in middleware"
```

> **Note (B1 risk):** the edge-runtime `fetch` to the in-cluster ES is validated by a post-deploy smoke test (see Task B7 Step 6), not here. If it cannot reach ES under `next start`, the fallback is a tiny nodejs `/api/_pageview` route the middleware calls instead — same `emitAccessEvent`, different runtime.

---

### Task B3: ES client helpers (range bounds, runtime fields, guarded search)

**Files:**
- Create: `lib/analytics/es-client.ts`
- Test: `tests/lib/analytics/es-client.test.ts`

**Interfaces:**
- Consumes: `TELEMETRY_ES_URL` (B1).
- Produces: `esRangeBounds(r: {start;end}): {gte;lte}`; `ES_INDEX: string`; `RUNTIME_MAPPINGS` (const); `esSearch(body): Promise<any|null>`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/analytics/es-client.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { esRangeBounds } from "@/lib/analytics/es-client"

describe("esRangeBounds", () => {
  it("maps GA4-style presets to ES date-math", () => {
    expect(esRangeBounds({ start: "28daysAgo", end: "today" })).toEqual({ gte: "now-28d/d", lte: "now/d" })
    expect(esRangeBounds({ start: "7daysAgo", end: "today" })).toEqual({ gte: "now-7d/d", lte: "now/d" })
  })
  it("passes custom ISO dates through", () => {
    expect(esRangeBounds({ start: "2026-06-01", end: "2026-06-15" })).toEqual({ gte: "2026-06-01", lte: "2026-06-15" })
  })
  it("falls back for unrecognized input", () => {
    expect(esRangeBounds({ start: "garbage", end: "today" })).toEqual({ gte: "now/d", lte: "now/d" })
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm test tests/lib/analytics/es-client.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement the client**

Create `lib/analytics/es-client.ts`:

```ts
import { TELEMETRY_ES_URL } from "@/lib/telemetry/access-event"

const ISO = /^\d{4}-\d{2}-\d{2}$/
const DAYS_AGO = /^(\d+)daysAgo$/

function toEsDate(v: string, fallback: string): string {
  if (v === "today") return "now/d"
  const m = DAYS_AGO.exec(v)
  if (m) return `now-${m[1]}d/d`
  if (ISO.test(v)) return v
  return fallback
}

/** DateRange (GA4-style presets or custom ISO) → ES date-math bounds. */
export function esRangeBounds(r: { start: string; end: string }): { gte: string; lte: string } {
  return { gte: toEsDate(r.start, "now/d"), lte: toEsDate(r.end, "now/d") }
}

export const ES_INDEX = "subfrost-cdn-*"

/** Painless runtime fields read from _source so aggregations survive the
 *  heterogeneous per-index mappings in the re-indexed dump (ja4/path are
 *  keyword in some indices, text+keyword in others). visitor_key = ja4|ip;
 *  session_key adds a 30-min window (doc['ts'] is a date in every index);
 *  path_src/referer_src expose path/headers.referer uniformly. Verified live:
 *  these run across all 12 shards with failed:0. */
export const RUNTIME_MAPPINGS = {
  visitor_key: { type: "keyword", script: { source: "def s=params._source; if (s!=null && s.ja4!=null) { def ip = s.source_ip!=null ? s.source_ip : ''; emit(s.ja4 + '|' + ip) }" } },
  session_key: { type: "keyword", script: { source: "def s=params._source; if (s!=null && s.ja4!=null) { def ip = s.source_ip!=null ? s.source_ip : ''; long t = doc['ts'].value.toInstant().toEpochMilli(); long w = t - (t % 1800000L); emit(s.ja4 + '|' + ip + '|' + w) }" } },
  path_src: { type: "keyword", script: { source: "if (params._source!=null && params._source.path!=null) { emit(params._source.path) }" } },
  referer_src: { type: "keyword", script: { source: "def s=params._source; if (s!=null && s.headers!=null && s.headers.referer!=null) { emit(s.headers.referer) }" } },
} as const

/** Guarded ES _search over subfrost-cdn-*; returns parsed body or null (never
 *  throws). Mirrors ga4.runReport's guard pattern. */
export async function esSearch(body: Record<string, unknown>): Promise<any | null> {
  try {
    const res = await fetch(`${TELEMETRY_ES_URL}/${ES_INDEX}/_search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm test tests/lib/analytics/es-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add lib/analytics/es-client.ts tests/lib/analytics/es-client.test.ts
git commit -m "feat(analytics): ES client (range date-math, _source runtime fields, guarded search)"
```

---

### Task B4: Channel classifier

**Files:**
- Create: `lib/analytics/channel.ts`
- Test: `tests/lib/analytics/channel.test.ts`

**Interfaces:**
- Produces: `classifyChannel(referer: string|null, utmSource: string|null, utmMedium: string|null): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/analytics/channel.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { classifyChannel } from "@/lib/analytics/channel"

describe("classifyChannel", () => {
  it("direct when no referer/utm", () => expect(classifyChannel(null, null, null)).toBe("direct"))
  it("organic for search engines", () => expect(classifyChannel("https://www.google.com/search?q=x", null, null)).toBe("organic"))
  it("social for x.com / t.co", () => {
    expect(classifyChannel("https://x.com/sub", null, null)).toBe("social")
    expect(classifyChannel("https://t.co/abc", null, null)).toBe("social")
  })
  it("referral for other hosts", () => expect(classifyChannel("https://news.ycombinator.com/", null, null)).toBe("referral"))
  it("utm overrides", () => {
    expect(classifyChannel("https://x.com/s", "twitter", "social")).toBe("social")
    expect(classifyChannel(null, "newsletter", null)).toBe("referral:newsletter")
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm test tests/lib/analytics/channel.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

Create `lib/analytics/channel.ts`:

```ts
const SEARCH = ["google.", "bing.", "duckduckgo.", "yahoo.", "baidu.", "yandex.", "ecosia."]
const SOCIAL = ["x.com", "t.co", "twitter.", "facebook.", "reddit.", "linkedin.", "lnkd.in", "youtube.", "youtu.be", "instagram.", "t.me", "telegram.", "discord.", "warpcast.", "farcaster."]

function host(referer: string): string {
  try { return new URL(referer).hostname.toLowerCase() } catch { return "" }
}

/** Coarse channel grouping from referer + utm. utm wins; then host heuristics. */
export function classifyChannel(referer: string | null, utmSource: string | null, utmMedium: string | null): string {
  if (utmMedium) return utmMedium.toLowerCase()
  if (utmSource) return `referral:${utmSource.toLowerCase()}`
  if (!referer) return "direct"
  const h = host(referer)
  if (!h) return "direct"
  if (SEARCH.some((s) => h.includes(s))) return "organic"
  if (SOCIAL.some((s) => h === s || h.includes(s))) return "social"
  return "referral"
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm test tests/lib/analytics/channel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add lib/analytics/channel.ts tests/lib/analytics/channel.test.ts
git commit -m "feat(analytics): channel classifier (direct/organic/social/referral + utm)"
```

---

### Task B5: Dwell heuristic

**Files:**
- Create: `lib/analytics/dwell.ts`
- Test: `tests/lib/analytics/dwell.test.ts`

**Interfaces:**
- Produces: `SessionHit { path: string; ts: number }`; `DwellAccum { totalMs: number; count: number }`; `articleSlug(path: string): string|null`; `dwellBySlug(sessions: SessionHit[][], maxDwellMs?: number): Map<string, DwellAccum>`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/analytics/dwell.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { dwellBySlug, articleSlug } from "@/lib/analytics/dwell"

describe("dwell", () => {
  it("articleSlug extracts the slug", () => {
    expect(articleSlug("/articles/hello-world?x=1")).toBe("hello-world")
    expect(articleSlug("/about")).toBeNull()
  })
  it("dwell = gap to next hit; last hit is a bounce; clamps", () => {
    const t = 1_000_000_000_000
    const session = [
      { path: "/", ts: t },
      { path: "/articles/a", ts: t + 10_000 },        // dwell 5s → b
      { path: "/articles/b", ts: t + 15_000 },        // dwell huge → clamp 1800s
      { path: "/articles/c", ts: t + 9_999_999 },     // last → bounce, skipped
    ]
    const m = dwellBySlug([session])
    expect(m.get("a")).toEqual({ totalMs: 5_000, count: 1 })
    expect(m.get("b")!.totalMs).toBe(1_800_000)
    expect(m.has("c")).toBe(false)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm test tests/lib/analytics/dwell.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

Create `lib/analytics/dwell.ts`:

```ts
export interface SessionHit { path: string; ts: number } // ts = epoch ms
export interface DwellAccum { totalMs: number; count: number }

const ARTICLE = /^\/articles\/([^/?#]+)/
export function articleSlug(path: string): string | null {
  const m = ARTICLE.exec(path)
  return m ? m[1] : null
}

/** Per session (hits sorted asc by ts), an article pageview's dwell is the gap
 *  to the next hit in the same session, clamped to maxDwellMs. The last hit of
 *  a session has no next hit (bounce) and is skipped. Accumulated per slug. */
export function dwellBySlug(sessions: SessionHit[][], maxDwellMs = 1_800_000): Map<string, DwellAccum> {
  const out = new Map<string, DwellAccum>()
  for (const hits of sessions) {
    const sorted = [...hits].sort((a, b) => a.ts - b.ts)
    for (let i = 0; i < sorted.length - 1; i++) {
      const slug = articleSlug(sorted[i].path)
      if (!slug) continue
      const gap = Math.min(sorted[i + 1].ts - sorted[i].ts, maxDwellMs)
      if (gap <= 0) continue
      const acc = out.get(slug) ?? { totalMs: 0, count: 0 }
      acc.totalMs += gap
      acc.count += 1
      out.set(slug, acc)
    }
  }
  return out
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm test tests/lib/analytics/dwell.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add lib/analytics/dwell.ts tests/lib/analytics/dwell.test.ts
git commit -m "feat(analytics): server-side dwell heuristic (Δts intra-session)"
```

---

### Task B6: `esSource` — aggregations, normalizers, getDashboard

**Files:**
- Create: `lib/analytics/es.ts`
- Test: `tests/lib/analytics/es-source.test.ts`

**Interfaces:**
- Consumes: `esSearch`, `esRangeBounds`, `RUNTIME_MAPPINGS` (B3); `classifyChannel` (B4); `dwellBySlug`, `articleSlug`, `SessionHit` (B5); `cacheGetOrCompute`, `prisma`, `rangeKey`, `emptyDashboard`, shapes (existing).
- Produces: `esSource: AnalyticsSource`; pure normalizers `normalizeVisitors`, `normalizeTopPages`, `normalizeTrafficSources` (exported for tests).

- [ ] **Step 1: Write the failing normalizer tests (with the live-captured fixture)**

Create `tests/lib/analytics/es-source.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ default: { article: { findMany: vi.fn(async () => []) } } }))

import { normalizeVisitors, normalizeTopPages, normalizeTrafficSources } from "@/lib/analytics/es"

// Real shape captured from the live ES (subfrost-cdn-* date_histogram).
const visitorsRes = { aggregations: { by_day: { buckets: [
  { key_as_string: "2026-05-28T00:00:00.000Z", key: 1779926400000, doc_count: 12002, visitors: { value: 3685 }, sessions: { value: 4200 } },
  { key_as_string: "2026-05-29T00:00:00.000Z", key: 1780012800000, doc_count: 20575, visitors: { value: 5058 }, sessions: { value: 6100 } },
] } } }

describe("es normalizers", () => {
  it("normalizeVisitors maps buckets + totals, date as YYYYMMDD", () => {
    const s = normalizeVisitors(visitorsRes)
    expect(s.points[0]).toEqual({ date: "20260528", activeUsers: 3685, sessions: 4200, pageViews: 12002 })
    expect(s.totals).toEqual({ activeUsers: 8743, sessions: 10300, pageViews: 32577 })
  })
  it("normalizeVisitors handles null (guard)", () => {
    expect(normalizeVisitors(null)).toEqual({ points: [], totals: { activeUsers: 0, sessions: 0, pageViews: 0 } })
  })
  it("normalizeTopPages maps terms buckets", () => {
    const rows = normalizeTopPages({ aggregations: { top_paths: { buckets: [{ key: "/articles/x", doc_count: 99 }] } } })
    expect(rows).toEqual([{ path: "/articles/x", title: null, pageViews: 99 }])
  })
  it("normalizeTrafficSources groups by channel, missing→direct", () => {
    const rows = normalizeTrafficSources({ aggregations: { by_referer: { buckets: [
      { key: "__none__", sessions: { value: 100 } },
      { key: "https://x.com/s", sessions: { value: 30 } },
      { key: "https://www.google.com/", sessions: { value: 20 } },
    ] } } })
    const byCh = Object.fromEntries(rows.map(r => [r.channel, r.sessions]))
    expect(byCh).toEqual({ direct: 100, social: 30, organic: 20 })
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm test tests/lib/analytics/es-source.test.ts`
Expected: FAIL — cannot resolve `@/lib/analytics/es`.

- [ ] **Step 3: Implement `lib/analytics/es.ts`**

Create `lib/analytics/es.ts`:

```ts
// Elasticsearch adapter for the Site analytics dashboard. Mirrors ga4Source:
// guarded, cached aggregations over subfrost-cdn-* normalized into the shapes
// in source.ts. All aggregations use the _source runtime fields (es-client) so
// they survive the heterogeneous per-index mappings.
import type { AnalyticsSource, AnalyticsDashboard, DateRange, VisitorsSeries, TopPageRow, TrafficSourceRow, ArticleEngagementRow } from "@/lib/analytics/source"
import { isEsConfigured } from "@/lib/analytics/source"
import { esSearch, esRangeBounds, RUNTIME_MAPPINGS } from "@/lib/analytics/es-client"
import { classifyChannel } from "@/lib/analytics/channel"
import { dwellBySlug, articleSlug, type SessionHit } from "@/lib/analytics/dwell"
import { rangeKey } from "@/lib/analytics/range"
import { cacheGetOrCompute } from "@/lib/redis"
import prisma from "@/lib/prisma"

const TTL = 900
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const rangeQuery = (r: DateRange) => ({ range: { ts: esRangeBounds(r) } })

// ---- visitors ----
export function normalizeVisitors(res: any): VisitorsSeries {
  const buckets = res?.aggregations?.by_day?.buckets ?? []
  const points = buckets.map((b: any) => ({
    date: String(b.key_as_string ?? "").slice(0, 10).replace(/-/g, ""),
    activeUsers: num(b.visitors?.value),
    sessions: num(b.sessions?.value),
    pageViews: num(b.doc_count),
  }))
  const totals = points.reduce((a: any, p: any) => ({
    activeUsers: a.activeUsers + p.activeUsers, sessions: a.sessions + p.sessions, pageViews: a.pageViews + p.pageViews,
  }), { activeUsers: 0, sessions: 0, pageViews: 0 })
  return { points, totals }
}
async function fetchVisitors(r: DateRange): Promise<VisitorsSeries> {
  return cacheGetOrCompute(`analytics:es:visitors:${rangeKey(r)}`, async () =>
    normalizeVisitors(await esSearch({
      size: 0, query: rangeQuery(r), runtime_mappings: RUNTIME_MAPPINGS,
      aggs: { by_day: { date_histogram: { field: "ts", calendar_interval: "day" },
        aggs: { visitors: { cardinality: { field: "visitor_key" } }, sessions: { cardinality: { field: "session_key" } } } } },
    })), TTL)
}

// ---- top pages ----
export function normalizeTopPages(res: any): TopPageRow[] {
  return (res?.aggregations?.top_paths?.buckets ?? []).map((b: any) => ({ path: b.key, title: null, pageViews: num(b.doc_count) }))
}
async function articleTitles(slugs: string[]): Promise<Map<string, string | null>> {
  if (!slugs.length) return new Map()
  const articles = await prisma.article.findMany({ where: { slug: { in: slugs } }, select: { slug: true, translations: { select: { title: true }, take: 1 } } })
  return new Map(articles.map((a) => [a.slug, a.translations[0]?.title ?? null]))
}
async function fetchTopPages(r: DateRange): Promise<TopPageRow[]> {
  return cacheGetOrCompute(`analytics:es:toppages:${rangeKey(r)}`, async () => {
    const rows = normalizeTopPages(await esSearch({
      size: 0, query: rangeQuery(r), runtime_mappings: RUNTIME_MAPPINGS,
      aggs: { top_paths: { terms: { field: "path_src", size: 20 } } },
    }))
    const titles = await articleTitles(rows.map((x) => articleSlug(x.path)).filter((s): s is string => !!s))
    return rows.map((x) => { const s = articleSlug(x.path); return s ? { ...x, title: titles.get(s) ?? null } : x })
  }, TTL)
}

// ---- traffic sources ----
export function normalizeTrafficSources(res: any): TrafficSourceRow[] {
  const buckets = res?.aggregations?.by_referer?.buckets ?? []
  const byChannel = new Map<string, { source: string | null; sessions: number }>()
  for (const b of buckets) {
    const referer = b.key === "__none__" ? null : b.key
    const channel = classifyChannel(referer, null, null)
    const sessions = num(b.sessions?.value)
    const prev = byChannel.get(channel)
    if (prev) prev.sessions += sessions
    else byChannel.set(channel, { source: referer, sessions })
  }
  return [...byChannel.entries()]
    .map(([channel, v]) => ({ channel, source: v.source, campaign: null, sessions: v.sessions }))
    .sort((a, b) => b.sessions - a.sessions)
}
async function fetchTrafficSources(r: DateRange): Promise<TrafficSourceRow[]> {
  return cacheGetOrCompute(`analytics:es:traffic:${rangeKey(r)}`, async () =>
    normalizeTrafficSources(await esSearch({
      size: 0, query: rangeQuery(r), runtime_mappings: RUNTIME_MAPPINGS,
      aggs: { by_referer: { terms: { field: "referer_src", size: 50, missing: "__none__" },
        aggs: { sessions: { cardinality: { field: "session_key" } } } } },
    })), TTL)
}

// ---- article engagement ----
const MAX_SESSION_PAGES = 50 // composite pages × 100 = session cap for dwell
async function collectArticleSessions(r: DateRange): Promise<SessionHit[][]> {
  const sessions: SessionHit[][] = []
  let after: Record<string, unknown> | undefined
  for (let page = 0; page < MAX_SESSION_PAGES; page++) {
    const res: any = await esSearch({
      size: 0, query: rangeQuery(r), runtime_mappings: RUNTIME_MAPPINGS,
      aggs: { sess: { composite: { size: 100, sources: [{ sk: { terms: { field: "session_key" } } }], ...(after ? { after } : {}) },
        aggs: { hits: { top_hits: { size: 50, _source: ["path", "ts"], sort: [{ ts: "asc" }] } } } } },
    })
    const agg = res?.aggregations?.sess
    if (!agg || !(agg.buckets?.length)) break
    for (const b of agg.buckets) {
      const hits: SessionHit[] = (b.hits?.hits?.hits ?? []).map((h: any) => ({ path: h._source?.path ?? "", ts: Date.parse(h._source?.ts ?? "") || 0 }))
      if (hits.some((h) => articleSlug(h.path))) sessions.push(hits)
    }
    if (!agg.after_key) break
    after = agg.after_key
    if (page === MAX_SESSION_PAGES - 1) console.warn(`[es analytics] dwell session cap hit (${MAX_SESSION_PAGES}×100) for range ${rangeKey(r)}; engagement is sampled`)
  }
  return sessions
}
async function fetchArticleEngagement(r: DateRange): Promise<ArticleEngagementRow[]> {
  return cacheGetOrCompute(`analytics:es:articles:${rangeKey(r)}`, async () => {
    const pvRes = await esSearch({
      size: 0, runtime_mappings: RUNTIME_MAPPINGS,
      query: { bool: { filter: [rangeQuery(r), { prefix: { path_src: "/articles/" } }] } },
      aggs: { arts: { terms: { field: "path_src", size: 50 } } },
    })
    const pv = new Map<string, { path: string; pageViews: number }>()
    for (const b of pvRes?.aggregations?.arts?.buckets ?? []) {
      const slug = articleSlug(b.key); if (!slug) continue
      pv.set(slug, { path: b.key, pageViews: num(b.doc_count) })
    }
    if (pv.size === 0) return []
    const dwell = dwellBySlug(await collectArticleSessions(r))
    const titles = await articleTitles([...pv.keys()])
    return [...pv.keys()].map((slug) => {
      const d = dwell.get(slug)
      return { slug, path: pv.get(slug)!.path, title: titles.get(slug) ?? null, pageViews: pv.get(slug)!.pageViews,
        avgEngagementSeconds: d && d.count > 0 ? d.totalMs / d.count / 1000 : null }
    }).sort((a, b) => b.pageViews - a.pageViews)
  }, TTL)
}

export const esSource: AnalyticsSource = {
  async getDashboard(range: DateRange): Promise<AnalyticsDashboard> {
    const [visitors, topPages, trafficSources, articleEngagement] = await Promise.all([
      fetchVisitors(range), fetchTopPages(range), fetchTrafficSources(range), fetchArticleEngagement(range),
    ])
    return { range, visitors, topPages, trafficSources, articleEngagement, configured: isEsConfigured() }
  },
}
```

- [ ] **Step 4: Add `isEsConfigured` to `lib/analytics/source.ts`**

Append to `lib/analytics/source.ts`:

```ts
/** ES analytics is reachable in-cluster in prod, or when TELEMETRY_ES_URL is set. */
export function isEsConfigured(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.TELEMETRY_ES_URL)
}
```

- [ ] **Step 5: Run the tests, verify they pass**

Run: `pnpm test tests/lib/analytics/es-source.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add lib/analytics/es.ts lib/analytics/source.ts tests/lib/analytics/es-source.test.ts
git commit -m "feat(analytics): esSource (visitors/top-pages/traffic/article-engagement over ES)"
```

---

### Task B7: Source selector + flip the page off GA4

**Files:**
- Create: `lib/analytics/select.ts`
- Modify: `app/admin/marketing/analytics/page.tsx`
- Test: `tests/lib/analytics/select.test.ts`

**Interfaces:**
- Consumes: `esSource` (B6), `ga4Source` (existing).
- Produces: `getAnalyticsSource(): AnalyticsSource`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/analytics/select.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest"

vi.mock("@/lib/analytics/es", () => ({ esSource: { __kind: "es", getDashboard: vi.fn() } }))
vi.mock("@/lib/analytics/ga4", () => ({ ga4Source: { __kind: "ga4", getDashboard: vi.fn() } }))

import { getAnalyticsSource } from "@/lib/analytics/select"

describe("getAnalyticsSource", () => {
  afterEach(() => { vi.unstubAllEnvs() })
  it("defaults to es", () => {
    expect((getAnalyticsSource() as any).__kind).toBe("es")
  })
  it("uses ga4 when ANALYTICS_SOURCE=ga4", () => {
    vi.stubEnv("ANALYTICS_SOURCE", "ga4")
    expect((getAnalyticsSource() as any).__kind).toBe("ga4")
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm test tests/lib/analytics/select.test.ts`
Expected: FAIL — cannot resolve `@/lib/analytics/select`.

- [ ] **Step 3: Implement the selector**

Create `lib/analytics/select.ts`:

```ts
import type { AnalyticsSource } from "@/lib/analytics/source"
import { esSource } from "@/lib/analytics/es"
import { ga4Source } from "@/lib/analytics/ga4"

/** First-party ES by default; GA4 retained as an env-selectable fallback for
 *  rollback/comparison during the cutover (ANALYTICS_SOURCE=ga4). */
export function getAnalyticsSource(): AnalyticsSource {
  return process.env.ANALYTICS_SOURCE === "ga4" ? ga4Source : esSource
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm test tests/lib/analytics/select.test.ts`
Expected: PASS.

- [ ] **Step 5: Flip the page**

In `app/admin/marketing/analytics/page.tsx`, replace the import and the source call:

```ts
import { getAnalyticsSource } from "@/lib/analytics/select"
```
(remove `import { ga4Source } from "@/lib/analytics/ga4"`), and:
```ts
  const dashboard = await getAnalyticsSource().getDashboard(range)
```
(was `await ga4Source.getDashboard(range)`). Everything else (gating `marketing.view`, `parseRange`, `AnalyticsClient`) is unchanged.

- [ ] **Step 6: Full gates + commit**

Run: `pnpm test tests/lib/ && pnpm exec tsc --noEmit && pnpm build`
Expected: all telemetry/analytics tests PASS; no type errors; build succeeds. (Pre-existing live-RPC integration tests under `tests/integration/` stay skipped without `RUN_INTEGRATION`.)

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add lib/analytics/select.ts app/admin/marketing/analytics/page.tsx tests/lib/analytics/select.test.ts
git commit -m "feat(analytics): flip Site analytics to first-party ES (GA4 env-selectable fallback)"
```

- [ ] **Step 7: (Human-owned) deploy + smoke test the edge→ES path**

After merge to `main` + Flux deploy (bump `newTag`, quoted; confirm with Vitor), validate the B1 risk live:

```bash
# 1) a real public pageview should land a tlsd-ingress doc in today's index
curl -s -H "Accept: text/html" https://subfrost.io/ -o /dev/null
# 2) confirm via ES (run from the cluster):
KIO="C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh"
bash "$KIO" -n telemetry exec elasticsearch-0 -c elasticsearch -- \
  curl -s "localhost:9200/subfrost-cdn-$(date -u +%Y.%m.%d)/_search?q=service:tlsd-ingress%20AND%20instance:edge-middleware&size=1" | grep -o '"path":"[^"]*"' | head
```
Expected: a hit with `instance:"edge-middleware"` and a real page `path` (not `/api/fp`). If **none** appears after a few page loads, the edge-runtime fetch did not reach ES → implement the `/api/_pageview` nodejs fallback (middleware `fetch`es it with the X-TLS-* headers forwarded; the route runs `emitAccessEvent`), then re-deploy. Also verify `https://subfrost.io/admin/marketing/analytics` → 307 (gated) and the page renders ES numbers when authed.

---

## Self-Review

- **Spec coverage:** B1 = shared emitter/access-event (spec §B1, §Module structure); B2 = middleware capture + matcher (§B1, decision 3/8); B3 = ES client incl. `_source` runtime fields + range date-math (§Metric definitions, the mapping-heterogeneity finding); B4 = channel classifier (§Metric definitions); B5 = dwell heuristic (decision 4); B6 = esSource 4 sections (§B2); B7 = selector + page flip (§B3, decision 7). All Part-B goals covered.
- **Placeholder scan:** none — every step has real code/commands. The `/api/_pageview` fallback is a contingency gated on a live smoke-test result (B1 risk), not a placeholder in the happy path.
- **Type consistency:** `AccessEvent`/`AccessEventInput` (B1) consumed verbatim by B2 and `/api/fp`; `esSearch`/`RUNTIME_MAPPINGS`/`esRangeBounds` (B3) used by B6; `SessionHit`/`dwellBySlug`/`articleSlug` (B5) used by B6; `esSource`/`ga4Source` (B6/existing) used by B7. Normalizer outputs match `source.ts` shapes (`VisitorPoint.date` = `YYYYMMDD` like GA4; `ArticleEngagementRow.avgEngagementSeconds: number|null`).
- **Edge-safety:** `lib/telemetry/access-event.ts` and `lib/telemetry/capture-path.ts` import nothing Node-only; `os` stays in `/api/fp` (nodejs). `lib/analytics/*` runs server-side (page is nodejs).
- **Out of scope (correctly absent):** no wasip2, no client beacon, no RabbitMQ, no schema change, no GA4 removal (kept as fallback).
