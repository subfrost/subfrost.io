# Marketing schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Marketing schedule area in `/admin` (calendar + timeline of marketing pushes with hybrid analytics, recurring "weekly report") plus a public RSS feed.

**Architecture:** A new `MarketingPush` model (broad marketing event: article/X/email/stat-card) optionally linked to an `Article`, plus a `RecurringPush` rule expanded into calendar ghosts that materialize on edit. Server components fetch data + the existing GA4 layer; a client component renders Calendar/Timeline tabs. RSS is a route handler reusing published articles + published pushes. Pure logic (recurrence expansion, analytics merge, RSS XML, month grid) is extracted into testable helpers.

**Tech Stack:** Next.js 16 App Router (RSC + server actions), Prisma + Postgres, Radix UI + Tailwind, Recharts/date-fns, Vitest (happy-dom).

## Global Constraints

- Code changes ship via **PR**, never push to `main`. Branch from `main` (NOT the #138 branch).
- Reuse the existing `marketing.view` privilege — do **not** edit `lib/cms/iam/registry.ts`.
- Do **not** edit `app/admin/layout.tsx` or `lib/cms/articles.ts` (touched by open PRs #132/#75). RSS push query goes in a new file.
- Keep edits to shared files (`prisma/schema.prisma`, `lib/cms/admin-nav.ts`, `app/layout.tsx`) **minimal and localized** — open PRs #138/#132 touch them; rebase after they land.
- Prisma import is the **default** export: `import prisma from "@/lib/prisma"`.
- Path alias `@/` = repo root. Tests live under `tests/`, named `*.test.ts(x)`, run with `pnpm test` (`vitest run`).
- Schema changes are **additive**; deploy applies them with `prisma db push` (no migration files in this repo).
- Money/large counts that could exceed Int4 use `Float` (precedent: `OpReturnDaily.fee*Sats`). Push metric counts here (impressions/likes) stay small → `Int` inside the JSON is fine; store metrics as `Json`.
- Dates stored UTC; calendar/occurrence math uses **UTC midnight** to avoid off-by-one across zones.

---

### Task 1: Prisma schema — models, enums, relations

**Files:**
- Modify: `prisma/schema.prisma` (add enums + 2 models; add relation lines to `User` ~line 300 and `Article` ~line 388)

**Interfaces:**
- Produces: Prisma models `MarketingPush`, `RecurringPush`; enums `PushChannel` (`ARTICLE|X|EMAIL|STAT_CARD|OTHER`), `PushStatus` (`IDEA|SCHEDULED|PUBLISHED|CANCELED`), `PushFrequency` (`WEEKLY|BIWEEKLY|MONTHLY`). Generated client exports these from `@prisma/client`.

- [ ] **Step 1: Add enums + models** at the end of `prisma/schema.prisma`:

```prisma
enum PushChannel {
  ARTICLE
  X
  EMAIL
  STAT_CARD
  OTHER
}

enum PushStatus {
  IDEA
  SCHEDULED
  PUBLISHED
  CANCELED
}

enum PushFrequency {
  WEEKLY
  BIWEEKLY
  MONTHLY
}

model MarketingPush {
  id             String         @id @default(cuid())
  title          String
  channel        PushChannel
  status         PushStatus     @default(IDEA)
  scheduledFor   DateTime?
  publishedAt    DateTime?
  articleId      String?
  article        Article?       @relation(fields: [articleId], references: [id], onDelete: SetNull)
  refUrl         String?
  notes          String?
  metrics        Json?
  screenshotUrl  String?
  recurrenceId   String?
  recurrence     RecurringPush? @relation(fields: [recurrenceId], references: [id], onDelete: SetNull)
  recurrenceDate DateTime?
  createdById    String?
  createdBy      User?          @relation("PushCreator", fields: [createdById], references: [id], onDelete: SetNull)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  @@unique([recurrenceId, recurrenceDate])
  @@index([scheduledFor])
  @@index([publishedAt])
  @@index([status])
  @@index([articleId])
}

model RecurringPush {
  id           String          @id @default(cuid())
  title        String
  channel      PushChannel     @default(ARTICLE)
  frequency    PushFrequency   @default(WEEKLY)
  dayOfWeek    Int
  dayOfMonth   Int?
  active       Boolean         @default(true)
  defaultNotes String?
  startDate    DateTime
  endDate      DateTime?
  instances    MarketingPush[]
  createdById  String?
  createdBy    User?           @relation("RecurringPushCreator", fields: [createdById], references: [id], onDelete: SetNull)
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
}
```

- [ ] **Step 2: Add inverse relations** to existing models. In `model User` (after the `marketingSnapshots` line, ~line 298):

```prisma
  marketingPushes    MarketingPush[]      @relation("PushCreator")
  recurringPushes    RecurringPush[]      @relation("RecurringPushCreator")
```

In `model Article` (after the `marketingSnapshots MarketingSnapshot[]` line, ~line 388):

```prisma
  marketingPushes    MarketingPush[]
```

- [ ] **Step 3: Validate + generate the client**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm prisma validate && pnpm prisma generate`
Expected: "The schema at prisma/schema.prisma is valid" then "Generated Prisma Client".

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: exits 0 (the new types compile; nothing references them yet).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(marketing): add MarketingPush + RecurringPush schema"
```

---

### Task 2: Recurrence expansion helper (pure, TDD)

**Files:**
- Create: `lib/cms/recurring-pushes.ts`
- Test: `tests/marketing/recurring-pushes.test.ts`

**Interfaces:**
- Consumes: `PushFrequency` from `@prisma/client` (Task 1).
- Produces: `expandOccurrences(rule: RecurrenceRule, rangeStart: Date, rangeEnd: Date): Date[]` (UTC-midnight dates within the inclusive range); `RecurrenceRule` interface.

- [ ] **Step 1: Write the failing test** — `tests/marketing/recurring-pushes.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { expandOccurrences, type RecurrenceRule } from "@/lib/cms/recurring-pushes"

const friday = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const weekly = (over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  frequency: "WEEKLY", dayOfWeek: 5, startDate: friday("2026-06-01"), endDate: null, active: true, ...over,
})

describe("expandOccurrences", () => {
  it("returns every Friday in June 2026 within range", () => {
    const out = expandOccurrences(weekly(), friday("2026-06-01"), friday("2026-06-30"))
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-06-05", "2026-06-12", "2026-06-19", "2026-06-26",
    ])
  })

  it("respects the range bounds inclusively", () => {
    const out = expandOccurrences(weekly(), friday("2026-06-12"), friday("2026-06-19"))
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-06-12", "2026-06-19"])
  })

  it("returns [] when inactive", () => {
    expect(expandOccurrences(weekly({ active: false }), friday("2026-06-01"), friday("2026-06-30"))).toEqual([])
  })

  it("honors endDate", () => {
    const out = expandOccurrences(weekly({ endDate: friday("2026-06-12") }), friday("2026-06-01"), friday("2026-06-30"))
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-06-05", "2026-06-12"])
  })

  it("BIWEEKLY keeps parity from startDate", () => {
    const out = expandOccurrences(weekly({ frequency: "BIWEEKLY" }), friday("2026-06-01"), friday("2026-07-05"))
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-06-05", "2026-06-19", "2026-07-03"])
  })

  it("MONTHLY uses dayOfMonth, clamping to month length", () => {
    const rule = weekly({ frequency: "MONTHLY", dayOfMonth: 31, startDate: friday("2026-01-01") })
    const out = expandOccurrences(rule, friday("2026-02-01"), friday("2026-04-30"))
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/marketing/recurring-pushes.test.ts`
Expected: FAIL — cannot find module `@/lib/cms/recurring-pushes`.

- [ ] **Step 3: Implement** — `lib/cms/recurring-pushes.ts`:

```ts
import type { PushFrequency } from "@prisma/client"

const DAY_MS = 86_400_000

export interface RecurrenceRule {
  frequency: PushFrequency
  dayOfWeek: number          // 0=Sun..6=Sat (WEEKLY/BIWEEKLY)
  dayOfMonth?: number | null // MONTHLY
  startDate: Date
  endDate?: Date | null
  active: boolean
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Occurrence dates (UTC midnight) within [rangeStart, rangeEnd] inclusive. Pure + deterministic. */
export function expandOccurrences(rule: RecurrenceRule, rangeStart: Date, rangeEnd: Date): Date[] {
  if (!rule.active) return []
  const start = utcMidnight(rangeStart)
  const end = utcMidnight(rangeEnd)
  if (end < start) return []
  const ruleStart = utcMidnight(rule.startDate)
  const ruleEnd = rule.endDate ? utcMidnight(rule.endDate) : null
  const lowerBound = ruleStart > start ? ruleStart : start
  const out: Date[] = []

  if (rule.frequency === "MONTHLY") {
    const dom = rule.dayOfMonth ?? ruleStart.getUTCDate()
    let y = lowerBound.getUTCFullYear()
    let m = lowerBound.getUTCMonth()
    while (true) {
      const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
      const occ = new Date(Date.UTC(y, m, Math.min(dom, daysInMonth)))
      if (occ > end) break
      if (occ >= lowerBound && occ >= ruleStart && (!ruleEnd || occ <= ruleEnd)) out.push(occ)
      m += 1
      if (m > 11) { m = 0; y += 1 }
    }
    return out
  }

  const step = rule.frequency === "BIWEEKLY" ? 14 : 7
  const firstDelta = (rule.dayOfWeek - ruleStart.getUTCDay() + 7) % 7
  let occ = new Date(ruleStart.getTime() + firstDelta * DAY_MS)
  if (occ < lowerBound) {
    const gap = Math.ceil((lowerBound.getTime() - occ.getTime()) / (step * DAY_MS))
    occ = new Date(occ.getTime() + gap * step * DAY_MS)
  }
  while (occ <= end) {
    if (occ >= ruleStart && (!ruleEnd || occ <= ruleEnd)) out.push(new Date(occ))
    occ = new Date(occ.getTime() + step * DAY_MS)
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/marketing/recurring-pushes.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cms/recurring-pushes.ts tests/marketing/recurring-pushes.test.ts
git commit -m "feat(marketing): recurrence occurrence expansion helper"
```

---

### Task 3: Analytics merge helper (pure, TDD)

**Files:**
- Create: `lib/cms/marketing-analytics.ts`
- Test: `tests/marketing/marketing-analytics.test.ts`

**Interfaces:**
- Consumes: `ArticleEngagementRow` from `@/lib/analytics/source`; `PushChannel` from `@prisma/client`.
- Produces: `PushMetrics`, `PushAnalytics` interfaces; `resolvePushAnalytics(push, ga4Rows): PushAnalytics`.

- [ ] **Step 1: Write the failing test** — `tests/marketing/marketing-analytics.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { resolvePushAnalytics } from "@/lib/cms/marketing-analytics"
import type { ArticleEngagementRow } from "@/lib/analytics/source"

const ga4: ArticleEngagementRow[] = [
  { slug: "eth-on-btc", title: "ETH", path: "/articles/eth-on-btc", pageViews: 2140, avgEngagementSeconds: 104 },
]

describe("resolvePushAnalytics", () => {
  it("uses GA4 for an article push matched by slug", () => {
    const a = resolvePushAnalytics({ channel: "ARTICLE", articleSlug: "eth-on-btc", metrics: null }, ga4)
    expect(a.source).toBe("ga4")
    expect(a.pageViews).toBe(2140)
    expect(a.avgEngagementSeconds).toBe(104)
  })

  it("falls back to manual metrics for an X push", () => {
    const a = resolvePushAnalytics({ channel: "X", articleSlug: null, metrics: { impressions: 38000, likes: 412 } }, ga4)
    expect(a.source).toBe("manual")
    expect(a.impressions).toBe(38000)
    expect(a.likes).toBe(412)
  })

  it("is 'none' when an article push has no GA4 match and no metrics", () => {
    const a = resolvePushAnalytics({ channel: "ARTICLE", articleSlug: "missing", metrics: null }, ga4)
    expect(a.source).toBe("none")
    expect(a.pageViews).toBeNull()
  })

  it("keeps manual metrics alongside GA4 on an article push", () => {
    const a = resolvePushAnalytics({ channel: "ARTICLE", articleSlug: "eth-on-btc", metrics: { likes: 9 } }, ga4)
    expect(a.source).toBe("ga4")
    expect(a.pageViews).toBe(2140)
    expect(a.likes).toBe(9)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/marketing/marketing-analytics.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement** — `lib/cms/marketing-analytics.ts`:

```ts
import type { PushChannel } from "@prisma/client"
import type { ArticleEngagementRow } from "@/lib/analytics/source"

export interface PushMetrics {
  impressions?: number | null
  likes?: number | null
  reposts?: number | null
  clicks?: number | null
}

export interface PushAnalytics {
  source: "ga4" | "manual" | "none"
  pageViews: number | null
  avgEngagementSeconds: number | null
  impressions: number | null
  likes: number | null
  reposts: number | null
  clicks: number | null
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

export function resolvePushAnalytics(
  push: { channel: PushChannel; articleSlug: string | null; metrics: PushMetrics | null },
  ga4Rows: ArticleEngagementRow[],
): PushAnalytics {
  const m = push.metrics ?? {}
  const manual = {
    impressions: num(m.impressions),
    likes: num(m.likes),
    reposts: num(m.reposts),
    clicks: num(m.clicks),
  }
  const hasManual = Object.values(manual).some((v) => v !== null)

  if (push.channel === "ARTICLE" && push.articleSlug) {
    const row = ga4Rows.find((r) => r.slug === push.articleSlug)
    if (row) {
      return { source: "ga4", pageViews: num(row.pageViews), avgEngagementSeconds: num(row.avgEngagementSeconds), ...manual }
    }
  }
  if (hasManual) return { source: "manual", pageViews: null, avgEngagementSeconds: null, ...manual }
  return { source: "none", pageViews: null, avgEngagementSeconds: null, impressions: null, likes: null, reposts: null, clicks: null }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/marketing/marketing-analytics.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cms/marketing-analytics.ts tests/marketing/marketing-analytics.test.ts
git commit -m "feat(marketing): hybrid push analytics resolver"
```

---

### Task 4: RSS XML builder (pure, TDD)

**Files:**
- Create: `lib/cms/rss.ts`
- Test: `tests/marketing/rss.test.ts`

**Interfaces:**
- Produces: `RssItem`, `RssChannel` interfaces; `buildRssXml(channel: RssChannel, items: RssItem[]): string`.

- [ ] **Step 1: Write the failing test** — `tests/marketing/rss.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { buildRssXml, type RssItem } from "@/lib/cms/rss"

const channel = { title: "SUBFROST", link: "https://subfrost.io", description: "Updates", selfUrl: "https://subfrost.io/feed.xml" }
const base: RssItem = {
  title: "Hello", link: "https://subfrost.io/articles/hello", guid: "a1",
  pubDate: new Date("2026-06-27T00:00:00.000Z"), description: "An intro", contentHtml: null,
}

describe("buildRssXml", () => {
  it("emits a well-formed RSS 2.0 document", () => {
    const xml = buildRssXml(channel, [base])
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).toContain("<title>SUBFROST</title>")
    expect(xml).toContain("<link>https://subfrost.io/articles/hello</link>")
    expect(xml).toContain("Sat, 27 Jun 2026 00:00:00 GMT")
  })

  it("escapes XML special characters in titles", () => {
    const xml = buildRssXml(channel, [{ ...base, title: 'A & B <c> "d"' }])
    expect(xml).toContain("A &amp; B &lt;c&gt; &quot;d&quot;")
    expect(xml).not.toContain("<c>")
  })

  it("wraps contentHtml in CDATA via content:encoded", () => {
    const xml = buildRssXml(channel, [{ ...base, contentHtml: "<p>Body & more</p>" }])
    expect(xml).toContain("<content:encoded><![CDATA[<p>Body & more</p>]]></content:encoded>")
  })

  it("omits content:encoded when contentHtml is null", () => {
    const xml = buildRssXml(channel, [base])
    expect(xml).not.toContain("content:encoded")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/marketing/rss.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement** — `lib/cms/rss.ts`:

```ts
export interface RssChannel {
  title: string
  link: string
  description: string
  selfUrl: string
}

export interface RssItem {
  title: string
  link: string
  guid: string
  pubDate: Date
  description: string
  contentHtml?: string | null
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function itemXml(it: RssItem): string {
  const parts = [
    "    <item>",
    `      <title>${esc(it.title)}</title>`,
    `      <link>${esc(it.link)}</link>`,
    `      <guid isPermaLink="false">${esc(it.guid)}</guid>`,
    `      <pubDate>${it.pubDate.toUTCString()}</pubDate>`,
    `      <description>${esc(it.description)}</description>`,
  ]
  if (it.contentHtml) parts.push(`      <content:encoded><![CDATA[${it.contentHtml}]]></content:encoded>`)
  parts.push("    </item>")
  return parts.join("\n")
}

export function buildRssXml(channel: RssChannel, items: RssItem[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${esc(channel.title)}</title>`,
    `    <link>${esc(channel.link)}</link>`,
    `    <description>${esc(channel.description)}</description>`,
    `    <atom:link href="${esc(channel.selfUrl)}" rel="self" type="application/rss+xml" />`,
    ...items.map(itemXml),
    "  </channel>",
    "</rss>",
  ].join("\n")
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/marketing/rss.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cms/rss.ts tests/marketing/rss.test.ts
git commit -m "feat(marketing): RSS 2.0 XML builder"
```

---

### Task 5: Month-grid helper (pure, TDD)

**Files:**
- Create: `lib/cms/calendar-grid.ts`
- Test: `tests/marketing/calendar-grid.test.ts`

**Interfaces:**
- Produces: `toDateKey(d: Date): string` (UTC `YYYY-MM-DD`); `buildMonthGrid(year: number, month: number): Date[][]` (Sun-first weeks of UTC-midnight dates covering `month`, 0-indexed); `bucketByDate<T>(items: T[], getDate: (x: T) => Date | null): Map<string, T[]>`.

- [ ] **Step 1: Write the failing test** — `tests/marketing/calendar-grid.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { toDateKey, buildMonthGrid, bucketByDate } from "@/lib/cms/calendar-grid"

describe("toDateKey", () => {
  it("formats a UTC date as YYYY-MM-DD", () => {
    expect(toDateKey(new Date("2026-06-05T00:00:00.000Z"))).toBe("2026-06-05")
  })
})

describe("buildMonthGrid", () => {
  it("June 2026 starts on the Sunday before June 1 (Mon)", () => {
    const weeks = buildMonthGrid(2026, 5) // 5 = June
    expect(weeks[0][0].toISOString().slice(0, 10)).toBe("2026-05-31")
    expect(weeks[0].length).toBe(7)
    const flat = weeks.flat().map((d) => d.toISOString().slice(0, 10))
    expect(flat).toContain("2026-06-29")
    expect(flat).toContain("2026-06-30")
  })
})

describe("bucketByDate", () => {
  it("groups items by UTC date key and skips nulls", () => {
    const items = [
      { id: "a", at: new Date("2026-06-05T00:00:00Z") },
      { id: "b", at: new Date("2026-06-05T00:00:00Z") },
      { id: "c", at: null },
    ]
    const map = bucketByDate(items, (x) => x.at)
    expect(map.get("2026-06-05")?.map((x) => x.id)).toEqual(["a", "b"])
    expect([...map.keys()]).toEqual(["2026-06-05"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/marketing/calendar-grid.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement** — `lib/cms/calendar-grid.ts`:

```ts
const DAY_MS = 86_400_000

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Sun-first weeks of UTC-midnight dates covering `month` (0-indexed). */
export function buildMonthGrid(year: number, month: number): Date[][] {
  const first = new Date(Date.UTC(year, month, 1))
  const startOffset = first.getUTCDay() // 0=Sun
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const weeksCount = Math.ceil((startOffset + daysInMonth) / 7)
  const gridStart = new Date(first.getTime() - startOffset * DAY_MS)
  const weeks: Date[][] = []
  let cursor = gridStart.getTime()
  for (let w = 0; w < weeksCount; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor))
      cursor += DAY_MS
    }
    weeks.push(week)
  }
  return weeks
}

export function bucketByDate<T>(items: T[], getDate: (x: T) => Date | null): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const it of items) {
    const d = getDate(it)
    if (!d) continue
    const key = toDateKey(d)
    const arr = map.get(key)
    if (arr) arr.push(it)
    else map.set(key, [it])
  }
  return map
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/marketing/calendar-grid.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cms/calendar-grid.ts tests/marketing/calendar-grid.test.ts
git commit -m "feat(marketing): month-grid + date-bucketing helpers"
```

---

### Task 6: Push queries + server actions

**Files:**
- Create: `lib/cms/marketing-pushes.ts` (Prisma queries + shared types)
- Create: `actions/cms/marketing-pushes.ts` ("use server" mutations)
- Test: `tests/marketing/marketing-pushes-actions.test.ts`

**Interfaces:**
- Consumes: `prisma` default export; `currentUser` from `@/lib/cms/authz`; `PushMetrics` from `@/lib/cms/marketing-analytics`; `revalidatePath` from `next/cache`.
- Produces (queries): `PushRow` type; `listPushes(): Promise<PushRow[]>`; `listRecurringRules(): Promise<RecurringPush[]>`; `getPublishedPushesForFeed(limit?: number): Promise<PushRow[]>`.
- Produces (actions): `PushActionResult = { ok: true; id: string } | { ok: false; error: string }`; `savePush(input: PushInput)`, `deletePush(id)`, `saveRecurrence(input: RecurrenceInput)`, `deleteRecurrence(id)`, `materializeRecurrence(ruleId, occurrenceDateISO)`.

- [ ] **Step 1: Write the queries module** — `lib/cms/marketing-pushes.ts`:

```ts
import prisma from "@/lib/prisma"
import type { MarketingPush, RecurringPush } from "@prisma/client"

export type PushRow = MarketingPush & { article: { slug: string; title: string | null } | null }

const includeArticle = {
  article: { select: { slug: true, translations: { select: { title: true, locale: true }, take: 1 } } },
} as const

function normalize(row: MarketingPush & { article: { slug: string; translations: { title: string }[] } | null }): PushRow {
  return { ...row, article: row.article ? { slug: row.article.slug, title: row.article.translations[0]?.title ?? null } : null }
}

export async function listPushes(): Promise<PushRow[]> {
  const rows = await prisma.marketingPush.findMany({ include: includeArticle, orderBy: { createdAt: "desc" } })
  return rows.map(normalize)
}

export async function listRecurringRules(): Promise<RecurringPush[]> {
  return prisma.recurringPush.findMany({ orderBy: { createdAt: "asc" } })
}

export async function getPublishedPushesForFeed(limit = 30): Promise<PushRow[]> {
  const rows = await prisma.marketingPush.findMany({
    where: { status: "PUBLISHED" },
    include: includeArticle,
    orderBy: { publishedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
  })
  return rows.map(normalize)
}
```

- [ ] **Step 2: Write the actions module** — `actions/cms/marketing-pushes.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import type { PushChannel, PushStatus, PushFrequency } from "@prisma/client"
import type { PushMetrics } from "@/lib/cms/marketing-analytics"

export type PushActionResult = { ok: true; id: string } | { ok: false; error: string }

export interface PushInput {
  id?: string
  title: string
  channel: PushChannel
  status: PushStatus
  scheduledFor?: string | null
  publishedAt?: string | null
  articleId?: string | null
  refUrl?: string | null
  notes?: string | null
  metrics?: PushMetrics | null
  screenshotUrl?: string | null
}

export interface RecurrenceInput {
  id?: string
  title: string
  channel: PushChannel
  frequency: PushFrequency
  dayOfWeek: number
  dayOfMonth?: number | null
  active: boolean
  defaultNotes?: string | null
  startDate: string
  endDate?: string | null
}

const PRIV = "marketing.view"
const toDate = (s?: string | null) => (s ? new Date(s) : null)

function revalidate() {
  revalidatePath("/admin/marketing/schedule")
  revalidatePath("/feed.xml")
}

export async function savePush(input: PushInput): Promise<PushActionResult> {
  const user = await currentUser()
  if (!user) return { ok: false, error: "Not authenticated" }
  if (!user.privileges.includes(PRIV)) return { ok: false, error: "Not allowed" }
  if (!input.title.trim()) return { ok: false, error: "Title is required" }

  const data = {
    title: input.title.trim(),
    channel: input.channel,
    status: input.status,
    scheduledFor: toDate(input.scheduledFor),
    publishedAt: toDate(input.publishedAt),
    articleId: input.articleId || null,
    refUrl: input.refUrl || null,
    notes: input.notes || null,
    metrics: input.metrics ?? undefined,
    screenshotUrl: input.screenshotUrl || null,
  }

  const row = input.id
    ? await prisma.marketingPush.update({ where: { id: input.id }, data })
    : await prisma.marketingPush.create({ data: { ...data, createdById: user.id } })
  revalidate()
  return { ok: true, id: row.id }
}

export async function deletePush(id: string): Promise<PushActionResult> {
  const user = await currentUser()
  if (!user || !user.privileges.includes(PRIV)) return { ok: false, error: "Not allowed" }
  await prisma.marketingPush.delete({ where: { id } })
  revalidate()
  return { ok: true, id }
}

export async function saveRecurrence(input: RecurrenceInput): Promise<PushActionResult> {
  const user = await currentUser()
  if (!user || !user.privileges.includes(PRIV)) return { ok: false, error: "Not allowed" }
  const data = {
    title: input.title.trim(),
    channel: input.channel,
    frequency: input.frequency,
    dayOfWeek: input.dayOfWeek,
    dayOfMonth: input.dayOfMonth ?? null,
    active: input.active,
    defaultNotes: input.defaultNotes || null,
    startDate: new Date(input.startDate),
    endDate: toDate(input.endDate),
  }
  const row = input.id
    ? await prisma.recurringPush.update({ where: { id: input.id }, data })
    : await prisma.recurringPush.create({ data: { ...data, createdById: user.id } })
  revalidate()
  return { ok: true, id: row.id }
}

export async function deleteRecurrence(id: string): Promise<PushActionResult> {
  const user = await currentUser()
  if (!user || !user.privileges.includes(PRIV)) return { ok: false, error: "Not allowed" }
  await prisma.recurringPush.delete({ where: { id } })
  revalidate()
  return { ok: true, id }
}

/** Idempotent: returns the existing instance for (ruleId, date) or creates one. */
export async function materializeRecurrence(ruleId: string, occurrenceDateISO: string): Promise<PushActionResult> {
  const user = await currentUser()
  if (!user || !user.privileges.includes(PRIV)) return { ok: false, error: "Not allowed" }
  const rule = await prisma.recurringPush.findUnique({ where: { id: ruleId } })
  if (!rule) return { ok: false, error: "Rule not found" }
  const recurrenceDate = new Date(`${occurrenceDateISO.slice(0, 10)}T00:00:00.000Z`)

  const existing = await prisma.marketingPush.findUnique({
    where: { recurrenceId_recurrenceDate: { recurrenceId: ruleId, recurrenceDate } },
  })
  if (existing) return { ok: true, id: existing.id }

  const row = await prisma.marketingPush.create({
    data: {
      title: rule.title,
      channel: rule.channel,
      status: "SCHEDULED",
      scheduledFor: recurrenceDate,
      notes: rule.defaultNotes,
      recurrenceId: ruleId,
      recurrenceDate,
      createdById: user.id,
    },
  })
  revalidate()
  return { ok: true, id: row.id }
}
```

- [ ] **Step 3: Write the test** — `tests/marketing/marketing-pushes-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  default: {
    marketingPush: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
    recurringPush: { findUnique: vi.fn() },
  },
}))

import { savePush, materializeRecurrence } from "@/actions/cms/marketing-pushes"
import { currentUser } from "@/lib/cms/authz"
import prisma from "@/lib/prisma"

const asUser = (privileges: string[]) => vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges } as never)

beforeEach(() => vi.clearAllMocks())

describe("savePush", () => {
  it("rejects without marketing.view", async () => {
    asUser([])
    expect(await savePush({ title: "x", channel: "X", status: "IDEA" })).toEqual({ ok: false, error: "Not allowed" })
    expect(prisma.marketingPush.create).not.toHaveBeenCalled()
  })

  it("creates a push for an authorized user", async () => {
    asUser(["marketing.view"])
    vi.mocked(prisma.marketingPush.create).mockResolvedValueOnce({ id: "p1" } as never)
    const res = await savePush({ title: "Thread", channel: "X", status: "SCHEDULED", scheduledFor: "2026-07-02" })
    expect(res).toEqual({ ok: true, id: "p1" })
  })
})

describe("materializeRecurrence", () => {
  it("returns the existing instance instead of duplicating", async () => {
    asUser(["marketing.view"])
    vi.mocked(prisma.recurringPush.findUnique).mockResolvedValueOnce({ id: "r1", title: "Weekly report", channel: "ARTICLE" } as never)
    vi.mocked(prisma.marketingPush.findUnique).mockResolvedValueOnce({ id: "existing" } as never)
    const res = await materializeRecurrence("r1", "2026-07-03")
    expect(res).toEqual({ ok: true, id: "existing" })
    expect(prisma.marketingPush.create).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm exec vitest run tests/marketing/marketing-pushes-actions.test.ts && pnpm exec tsc --noEmit`
Expected: PASS (3 tests); tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add lib/cms/marketing-pushes.ts actions/cms/marketing-pushes.ts tests/marketing/marketing-pushes-actions.test.ts
git commit -m "feat(marketing): push queries + server actions"
```

---

### Task 7: RSS route handler + autodiscovery

**Files:**
- Create: `app/feed.xml/route.ts`
- Modify: `app/layout.tsx` (add `alternates.types` to the existing `metadata`)
- Test: `tests/marketing/feed-route.test.ts`

**Interfaces:**
- Consumes: `getPublishedPreviews` from `@/lib/cms/articles`; `getPublishedPushesForFeed` from `@/lib/cms/marketing-pushes`; `buildRssXml`/`RssItem` from `@/lib/cms/rss`.
- Produces: `GET(): Promise<Response>` returning `application/rss+xml`.

- [ ] **Step 1: Write the failing test** — `tests/marketing/feed-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/articles", () => ({ getPublishedPreviews: vi.fn() }))
vi.mock("@/lib/cms/marketing-pushes", () => ({ getPublishedPushesForFeed: vi.fn() }))

import { GET } from "@/app/feed.xml/route"
import { getPublishedPreviews } from "@/lib/cms/articles"
import { getPublishedPushesForFeed } from "@/lib/cms/marketing-pushes"

beforeEach(() => vi.clearAllMocks())

describe("GET /feed.xml", () => {
  it("returns RSS XML with article + push items", async () => {
    vi.mocked(getPublishedPreviews).mockResolvedValueOnce([
      { slug: "hello", title: "Hello", excerpt: "Hi", publishedAt: "2026-06-27T00:00:00.000Z", coverImage: null } as never,
    ])
    vi.mocked(getPublishedPushesForFeed).mockResolvedValueOnce([
      { id: "p1", title: "Thread", channel: "X", refUrl: "https://x.com/s/1", publishedAt: new Date("2026-06-26T00:00:00Z"), notes: "n", article: null } as never,
    ])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("application/rss+xml")
    const body = await res.text()
    expect(body).toContain("<title>Hello</title>")
    expect(body).toContain("<title>Thread</title>")
    expect(body).toContain("https://x.com/s/1")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/marketing/feed-route.test.ts`
Expected: FAIL — cannot find module `@/app/feed.xml/route`.

- [ ] **Step 3: Implement** — `app/feed.xml/route.ts`:

```ts
import { getPublishedPreviews } from "@/lib/cms/articles"
import { getPublishedPushesForFeed, type PushRow } from "@/lib/cms/marketing-pushes"
import { buildRssXml, type RssItem } from "@/lib/cms/rss"

export const dynamic = "force-dynamic"

const SITE = "https://subfrost.io"

function pushItem(p: PushRow): RssItem {
  const link = p.article ? `${SITE}/articles/${p.article.slug}` : p.refUrl || SITE
  return {
    title: p.title,
    link,
    guid: `push:${p.id}`,
    pubDate: p.publishedAt ?? p.createdAt,
    description: p.notes || `${p.channel} push`,
    contentHtml: null,
  }
}

export async function GET(): Promise<Response> {
  const [articles, pushes] = await Promise.all([
    getPublishedPreviews({ limit: 30 }).catch(() => []),
    getPublishedPushesForFeed(30).catch(() => []),
  ])

  const articleItems: RssItem[] = articles.map((a) => ({
    title: a.title,
    link: `${SITE}/articles/${a.slug}`,
    guid: `article:${a.slug}`,
    pubDate: a.publishedAt ? new Date(a.publishedAt) : new Date(0),
    description: a.excerpt,
    contentHtml: null,
  }))

  const items = [...articleItems, ...pushes.map(pushItem)].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())

  const xml = buildRssXml(
    { title: "SUBFROST", link: SITE, description: "SUBFROST articles and updates", selfUrl: `${SITE}/feed.xml` },
    items,
  )
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  })
}
```

- [ ] **Step 4: Add autodiscovery** in `app/layout.tsx` — extend the existing `alternates` block in `metadata`:

```ts
  alternates: {
    canonical: "https://subfrost.io",
    types: { "application/rss+xml": "https://subfrost.io/feed.xml" },
  },
```

- [ ] **Step 5: Run test + build**

Run: `pnpm exec vitest run tests/marketing/feed-route.test.ts && pnpm exec tsc --noEmit`
Expected: PASS (1 test); tsc exits 0.

- [ ] **Step 6: Commit**

```bash
git add app/feed.xml/route.ts app/layout.tsx tests/marketing/feed-route.test.ts
git commit -m "feat(marketing): public RSS feed + autodiscovery"
```

---

### Task 8: Nav entry + schedule page (server component)

> **Execution order:** run **Task 9 before this task** — the page imports `ScheduleClient`, which Task 9 creates. This keeps every commit green.

**Files:**
- Modify: `lib/cms/admin-nav.ts` (add one `NavLeaf` to the `marketing` group)
- Create: `app/admin/marketing/schedule/page.tsx`
- Test: `tests/marketing/admin-nav.test.ts`

**Interfaces:**
- Consumes: `visibleNav` from `@/lib/cms/admin-nav`; `currentUser` (authz); `ga4Source`/`parseRange` (analytics); `listPushes`/`listRecurringRules` (Task 6); `ScheduleClient` (Task 9).
- Produces: the `/admin/marketing/schedule` route; nav leaf `{ label: "Schedule", href: "/admin/marketing/schedule", privilege: "marketing.view" }`.

- [ ] **Step 1: Write the failing test** — `tests/marketing/admin-nav.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { visibleNav } from "@/lib/cms/admin-nav"

describe("marketing nav", () => {
  it("includes the Schedule leaf for marketing.view", () => {
    const groups = visibleNav(["marketing.view"])
    const marketing = groups.find((g) => g.key === "marketing")
    expect(marketing?.items.map((i) => i.href)).toContain("/admin/marketing/schedule")
  })

  it("hides marketing entirely without the privilege", () => {
    const groups = visibleNav([])
    expect(groups.find((g) => g.key === "marketing")).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/marketing/admin-nav.test.ts`
Expected: FAIL — `/admin/marketing/schedule` not in the items.

- [ ] **Step 3: Add the nav leaf.** In `lib/cms/admin-nav.ts`, import the `CalendarClock` icon (add to the existing `lucide-react` import) and add to the `marketing` group's `items` array (after "Stat cards"):

```ts
      { label: "Schedule", href: "/admin/marketing/schedule", icon: CalendarClock, privilege: "marketing.view" },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/marketing/admin-nav.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the page** — `app/admin/marketing/schedule/page.tsx`:

```tsx
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { ga4Source } from "@/lib/analytics/ga4"
import { parseRange } from "@/lib/analytics/range"
import { listPushes, listRecurringRules } from "@/lib/cms/marketing-pushes"
import { ScheduleClient } from "@/components/cms/marketing/ScheduleClient"

export const dynamic = "force-dynamic"

export default async function SchedulePage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("marketing.view")) redirect("/admin")

  const [pushes, rules, dashboard] = await Promise.all([
    listPushes(),
    listRecurringRules(),
    ga4Source.getDashboard(parseRange("90d")),
  ])

  return <ScheduleClient pushes={pushes} rules={rules} articleEngagement={dashboard.articleEngagement} />
}
```

- [ ] **Step 6: Typecheck** (Task 9 already created `ScheduleClient`, so this passes)

Run: `pnpm exec tsc --noEmit`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add lib/cms/admin-nav.ts app/admin/marketing/schedule/page.tsx tests/marketing/admin-nav.test.ts
git commit -m "feat(marketing): schedule nav entry + page shell"
```

---

### Task 9: ScheduleClient — calendar, timeline, editors

**Files:**
- Create: `components/cms/marketing/ScheduleClient.tsx` (tabs + state + dialogs)
- Create: `components/cms/marketing/pushChannel.ts` (channel color/label map, pure)
- Test: `tests/marketing/push-channel.test.ts`

**Interfaces:**
- Consumes: `PushRow` (Task 6), `RecurringPush`/enums (`@prisma/client`), `ArticleEngagementRow` (analytics), `buildMonthGrid`/`toDateKey`/`bucketByDate` (Task 5), `expandOccurrences` (Task 2), `resolvePushAnalytics` (Task 3), the server actions (Task 6).
- Produces: `ScheduleClient` React component; `CHANNEL_META` map + `channelLabel`.

- [ ] **Step 1: Write the failing test** — `tests/marketing/push-channel.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { CHANNEL_META, channelLabel } from "@/components/cms/marketing/pushChannel"

describe("channel meta", () => {
  it("has an entry for every channel", () => {
    for (const c of ["ARTICLE", "X", "EMAIL", "STAT_CARD", "OTHER"] as const) {
      expect(CHANNEL_META[c]).toBeTruthy()
      expect(typeof CHANNEL_META[c].dot).toBe("string")
    }
  })
  it("labels channels for display", () => {
    expect(channelLabel("X")).toBe("X / Twitter")
    expect(channelLabel("STAT_CARD")).toBe("Stat-card")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/marketing/push-channel.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the channel map** — `components/cms/marketing/pushChannel.ts`:

```ts
import type { PushChannel } from "@prisma/client"

export interface ChannelMeta { label: string; dot: string; bg: string; fg: string }

export const CHANNEL_META: Record<PushChannel, ChannelMeta> = {
  ARTICLE:   { label: "Article",    dot: "#378ADD", bg: "#E6F1FB", fg: "#0C447C" },
  X:         { label: "X / Twitter", dot: "#5F5E5A", bg: "#F1EFE8", fg: "#2C2C2A" },
  EMAIL:     { label: "Email",      dot: "#BA7517", bg: "#FAEEDA", fg: "#633806" },
  STAT_CARD: { label: "Stat-card",  dot: "#7F77DD", bg: "#EEEDFE", fg: "#3C3489" },
  OTHER:     { label: "Other",      dot: "#888780", bg: "#F1EFE8", fg: "#2C2C2A" },
}

export function channelLabel(c: PushChannel): string {
  return CHANNEL_META[c].label
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/marketing/push-channel.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `ScheduleClient`** — `components/cms/marketing/ScheduleClient.tsx`. This is the UI shell wiring the tested helpers + actions. Complete code:

```tsx
"use client"

import { useMemo, useState } from "react"
import * as Tabs from "@radix-ui/react-tabs"
import type { MarketingPush, RecurringPush, PushChannel, PushStatus } from "@prisma/client"
import type { PushRow } from "@/lib/cms/marketing-pushes"
import type { ArticleEngagementRow } from "@/lib/analytics/source"
import { buildMonthGrid, toDateKey, bucketByDate } from "@/lib/cms/calendar-grid"
import { expandOccurrences } from "@/lib/cms/recurring-pushes"
import { resolvePushAnalytics, type PushMetrics } from "@/lib/cms/marketing-analytics"
import { CHANNEL_META, channelLabel } from "./pushChannel"
import { savePush, deletePush, materializeRecurrence, type PushInput } from "@/actions/cms/marketing-pushes"

interface Props {
  pushes: PushRow[]
  rules: RecurringPush[]
  articleEngagement: ArticleEngagementRow[]
}

interface Ghost { ruleId: string; date: Date; title: string; channel: PushChannel }

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

export function ScheduleClient({ pushes, rules, articleEngagement }: Props) {
  const today = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState({ year: today.getUTCFullYear(), month: today.getUTCMonth() })
  const [editing, setEditing] = useState<Partial<PushRow> | null>(null)

  const weeks = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor])
  const rangeStart = weeks[0][0]
  const rangeEnd = weeks[weeks.length - 1][6]

  const scheduled = pushes.filter((p) => p.status === "SCHEDULED" && p.scheduledFor)
  const byDate = useMemo(() => bucketByDate(scheduled, (p) => (p.scheduledFor ? new Date(p.scheduledFor) : null)), [scheduled])

  const materializedKeys = useMemo(() => {
    const s = new Set<string>()
    for (const p of pushes) if (p.recurrenceId && p.recurrenceDate) s.add(`${p.recurrenceId}:${toDateKey(new Date(p.recurrenceDate))}`)
    return s
  }, [pushes])

  const ghostsByDate = useMemo(() => {
    const map = new Map<string, Ghost[]>()
    for (const r of rules) {
      const occ = expandOccurrences(
        { frequency: r.frequency, dayOfWeek: r.dayOfWeek, dayOfMonth: r.dayOfMonth, startDate: new Date(r.startDate), endDate: r.endDate ? new Date(r.endDate) : null, active: r.active },
        rangeStart, rangeEnd,
      )
      for (const d of occ) {
        const key = toDateKey(d)
        if (materializedKeys.has(`${r.id}:${key}`)) continue
        const g: Ghost = { ruleId: r.id, date: d, title: r.title, channel: r.channel }
        const arr = map.get(key); if (arr) arr.push(g); else map.set(key, [g])
      }
    }
    return map
  }, [rules, rangeStart, rangeEnd, materializedKeys])

  const backlog = pushes.filter((p) => p.status === "IDEA")
  const published = pushes.filter((p) => p.status === "PUBLISHED").sort(
    (a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime(),
  )

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const m = c.month + delta
      if (m < 0) return { year: c.year - 1, month: 11 }
      if (m > 11) return { year: c.year + 1, month: 0 }
      return { year: c.year, month: m }
    })
  }

  async function openGhost(g: Ghost) {
    const res = await materializeRecurrence(g.ruleId, toDateKey(g.date))
    if (res.ok) setEditing({ id: res.id, title: g.title, channel: g.channel, status: "SCHEDULED", scheduledFor: g.date })
  }

  const todayKey = toDateKey(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())))

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Marketing schedule</h1>
        <button className="rounded-md border px-3 py-1.5 text-sm" onClick={() => setEditing({ status: "IDEA", channel: "ARTICLE", title: "" })}>
          New push
        </button>
      </div>

      <Tabs.Root defaultValue="calendar">
        <Tabs.List className="flex gap-2 border-b">
          <Tabs.Trigger value="calendar" className="px-3 py-2 text-sm data-[state=active]:font-medium">Calendar</Tabs.Trigger>
          <Tabs.Trigger value="timeline" className="px-3 py-2 text-sm data-[state=active]:font-medium">Timeline</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="calendar" className="pt-4">
          <div className="flex gap-4 items-start">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <button aria-label="Previous month" onClick={() => shiftMonth(-1)}>‹</button>
                <span className="text-sm font-medium">{MONTHS[cursor.month]} {cursor.year}</span>
                <button aria-label="Next month" onClick={() => shiftMonth(1)}>›</button>
                <button className="ml-2 text-xs border rounded px-2 py-0.5" onClick={() => setCursor({ year: today.getUTCFullYear(), month: today.getUTCMonth() })}>Today</button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DOW.map((d) => <div key={d} className="text-center text-xs text-muted-foreground">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {weeks.flat().map((d) => {
                  const key = toDateKey(d)
                  const inMonth = d.getUTCMonth() === cursor.month
                  const dayPushes = byDate.get(key) ?? []
                  const ghosts = ghostsByDate.get(key) ?? []
                  return (
                    <div key={key} className={`min-h-[74px] rounded-md border p-1 text-xs ${inMonth ? "" : "opacity-50"} ${key === todayKey ? "border-blue-500" : ""}`}
                         onClick={() => setEditing({ status: "SCHEDULED", channel: "ARTICLE", title: "", scheduledFor: d })}>
                      <div className="text-muted-foreground">{d.getUTCDate()}</div>
                      {dayPushes.map((p) => {
                        const meta = CHANNEL_META[p.channel]
                        const late = p.scheduledFor && new Date(p.scheduledFor) < new Date(todayKey)
                        return (
                          <div key={p.id} className="mt-0.5 rounded px-1 truncate" style={{ background: late ? "#FCEBEB" : meta.bg, color: late ? "#A32D2D" : meta.fg }}
                               onClick={(e) => { e.stopPropagation(); setEditing(p) }}>
                            {p.title}{late ? " · late" : ""}
                          </div>
                        )
                      })}
                      {ghosts.map((g) => {
                        const meta = CHANNEL_META[g.channel]
                        return (
                          <div key={`${g.ruleId}:${key}`} className="mt-0.5 rounded px-1 truncate border border-dashed" style={{ color: meta.fg }}
                               onClick={(e) => { e.stopPropagation(); void openGhost(g) }}>
                            {g.title} · auto
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="w-40 shrink-0">
              <div className="text-xs font-medium text-muted-foreground mb-1">Backlog</div>
              <div className="rounded-md bg-muted p-2 space-y-1">
                {backlog.length === 0 && <div className="text-xs text-muted-foreground">No ideas yet</div>}
                {backlog.map((p) => (
                  <div key={p.id} className="rounded px-1 text-xs truncate cursor-pointer" style={{ background: CHANNEL_META[p.channel].bg, color: CHANNEL_META[p.channel].fg }}
                       onClick={() => setEditing(p)}>{p.title}</div>
                ))}
              </div>
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="timeline" className="pt-4 space-y-2">
          {published.length === 0 && <div className="text-sm text-muted-foreground">No published pushes yet</div>}
          {published.map((p) => {
            const a = resolvePushAnalytics({ channel: p.channel, articleSlug: p.article?.slug ?? null, metrics: (p.metrics as PushMetrics | null) }, articleEngagement)
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-md border p-2 text-sm cursor-pointer" onClick={() => setEditing(p)}>
                <span className="text-xs text-muted-foreground w-16 shrink-0">{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : "—"}</span>
                <span className="rounded px-1.5 text-xs shrink-0" style={{ background: CHANNEL_META[p.channel].bg, color: CHANNEL_META[p.channel].fg }}>{channelLabel(p.channel)}</span>
                <span className="flex-1 min-w-0 truncate">{p.title}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {a.source === "ga4" ? `${a.pageViews?.toLocaleString()} views · GA4`
                    : a.source === "manual" ? `${a.impressions?.toLocaleString() ?? "—"} impr · manual`
                    : "—"}
                </span>
              </div>
            )
          })}
        </Tabs.Content>
      </Tabs.Root>

      {editing && (
        <PushEditor
          initial={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function PushEditor({ initial, onClose }: { initial: Partial<PushRow>; onClose: () => void }) {
  const [title, setTitle] = useState(initial.title ?? "")
  const [channel, setChannel] = useState<PushChannel>((initial.channel as PushChannel) ?? "ARTICLE")
  const [status, setStatus] = useState<PushStatus>((initial.status as PushStatus) ?? "IDEA")
  const [scheduledFor, setScheduledFor] = useState(initial.scheduledFor ? toDateKey(new Date(initial.scheduledFor)) : "")
  const [refUrl, setRefUrl] = useState(initial.refUrl ?? "")
  const [notes, setNotes] = useState(initial.notes ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSaving(true); setError(null)
    const input: PushInput = {
      id: initial.id, title, channel, status,
      scheduledFor: scheduledFor || null,
      refUrl: refUrl || null, notes: notes || null,
      articleId: initial.articleId ?? null,
    }
    const res = await savePush(input)
    setSaving(false)
    if (res.ok) onClose(); else setError(res.error)
  }

  async function remove() {
    if (!initial.id) return
    setSaving(true)
    const res = await deletePush(initial.id)
    setSaving(false)
    if (res.ok) onClose(); else setError(res.error)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background rounded-lg p-4 w-[420px] space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-medium">{initial.id ? "Edit push" : "New push"}</h2>
        <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex gap-2">
          <select className="border rounded px-2 py-1 text-sm flex-1" value={channel} onChange={(e) => setChannel(e.target.value as PushChannel)}>
            {(["ARTICLE","X","EMAIL","STAT_CARD","OTHER"] as PushChannel[]).map((c) => <option key={c} value={c}>{channelLabel(c)}</option>)}
          </select>
          <select className="border rounded px-2 py-1 text-sm flex-1" value={status} onChange={(e) => setStatus(e.target.value as PushStatus)}>
            {(["IDEA","SCHEDULED","PUBLISHED","CANCELED"] as PushStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <input type="date" className="w-full border rounded px-2 py-1 text-sm" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
        <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Reference URL (X post, etc.)" value={refUrl} onChange={(e) => setRefUrl(e.target.value)} />
        <textarea className="w-full border rounded px-2 py-1 text-sm" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {initial.articleId && <a className="text-sm text-blue-600 underline" href={`/admin/articles/${initial.articleId}`}>Open draft</a>}
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div className="flex justify-between">
          {initial.id ? <button className="text-sm text-red-600" onClick={remove} disabled={saving}>Delete</button> : <span />}
          <div className="flex gap-2">
            <button className="text-sm border rounded px-3 py-1" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="text-sm border rounded px-3 py-1 font-medium" onClick={submit} disabled={saving}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

> Note: this v1 editor omits manual-metric fields, screenshot upload, the searchable article picker, and the recurrence-rule editor UI — the actions + schema already support them (`savePush` accepts `metrics`/`screenshotUrl`; `saveRecurrence` exists). They are deliberately deferred to Task 11 follow-ups to keep this task reviewable.

- [ ] **Step 6: Typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: tsc exits 0; build succeeds and lists the `/admin/marketing/schedule` and `/feed.xml` routes.

- [ ] **Step 7: Commit**

```bash
git add components/cms/marketing/ScheduleClient.tsx components/cms/marketing/pushChannel.ts tests/marketing/push-channel.test.ts
git commit -m "feat(marketing): schedule calendar + timeline UI"
```

---

### Task 10: Seed the weekly-report recurrence

**Files:**
- Create: `scripts/seed-weekly-report.ts` (idempotent; run in-pod at deploy)

**Interfaces:**
- Consumes: `prisma` default export.
- Produces: one `RecurringPush` titled "Weekly report" (Fridays) if none exists.

- [ ] **Step 1: Implement** — `scripts/seed-weekly-report.ts`:

```ts
import prisma from "@/lib/prisma"

async function main() {
  const existing = await prisma.recurringPush.findFirst({ where: { title: "Weekly report" } })
  if (existing) {
    console.log(`Weekly report rule already exists (${existing.id}) — no-op`)
    return
  }
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: { createdAt: "asc" } })
  const rule = await prisma.recurringPush.create({
    data: {
      title: "Weekly report",
      channel: "ARTICLE",
      frequency: "WEEKLY",
      dayOfWeek: 5, // Friday
      active: true,
      startDate: new Date("2026-06-29T00:00:00.000Z"),
      createdById: admin?.id ?? null,
    },
  })
  console.log(`Created Weekly report rule ${rule.id}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm exec tsc --noEmit`
Expected: exits 0. (The script is run manually in-pod with `pnpm tsx scripts/seed-weekly-report.ts` at deploy — see Task 11. Do NOT run it against prod from a dev machine.)

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-weekly-report.ts
git commit -m "feat(marketing): idempotent weekly-report seed script"
```

---

### Task 11: Full-suite gates + deploy notes

**Files:** none (verification + docs)

- [ ] **Step 1: Run the full project gates**

Run: `pnpm exec tsc --noEmit && pnpm test && pnpm build`
Expected: tsc 0; vitest green except the ~8 `tests/integration/` live-RPC tests that are offline in this environment (they are skipped/expected-fail without `RUN_INTEGRATION=true`); build lists `/admin/marketing/schedule` and `/feed.xml`.

- [ ] **Step 2: Manual smoke (local dev)**

Run: `pnpm dev`, then as a `marketing.view` user:
- `/admin/marketing/schedule` → Calendar shows the Friday "Weekly report" ghost; click it → materializes + opens the editor.
- Create a push on a day; switch to Timeline; mark one PUBLISHED and confirm it appears with analytics ("—" if GA4 unconfigured).
- `GET /feed.xml` → valid RSS with article + push items.

- [ ] **Step 3: Open the PR** (human-owned merge)

```bash
git push -u origin feat/marketing-schedule
gh pr create --title "feat(marketing): schedule (calendar+timeline) + RSS feed" --body "Implements docs/superpowers/specs/2026-06-29-marketing-schedule-design.md"
```

- [ ] **Step 4: Deploy (human-owned, after merge)**
- Apply additive schema: in-pod `prisma db push`.
- Seed: in-pod `pnpm tsx scripts/seed-weekly-report.ts` (idempotent).
- Bump `newTag` (WITH QUOTES) in `k8s/kustomization.yaml` → Flux (annotate GitRepository source before Kustomization).

---

## Self-Review

**Spec coverage:**
- §3 data model → Task 1. ✓
- §4 recurring pushes → Task 2 (expand) + Task 6 (materialize) + Task 9 (ghosts) + Task 10 (seed). ✓
- §5 hybrid analytics → Task 3 (resolver) + Task 9 (timeline render). ✓
- §6 UI (page/nav/calendar/timeline/editor) → Tasks 8, 9. ✓ (Recurrence-editor UI + manual-metric/screenshot/article-picker fields explicitly deferred — noted in Task 9; actions/schema already support them.)
- §7 RSS → Task 4 (builder) + Task 7 (route + autodiscovery). ✓
- §8 server actions → Task 6. ✓
- §9 error handling (GA4 "—", SetNull, UTC) → Task 3/6/7 + schema. ✓
- §10 testing → pure helpers TDD'd (Tasks 2-5), actions/route tested (6,7), full gates (11). ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; deferred UI bits are explicit, not vague. ✓

**Type consistency:** `PushRow` (Task 6) used in Tasks 7/8/9; `PushMetrics`/`resolvePushAnalytics` (Task 3) used in 9; `PushInput`/`savePush` (Task 6) used in 9; `buildMonthGrid`/`toDateKey`/`bucketByDate` (Task 5) used in 9; `expandOccurrences`+`RecurrenceRule` (Task 2) used in 9; `buildRssXml`/`RssItem` (Task 4) used in 7; enum literals match Task 1. The `recurrenceId_recurrenceDate` compound unique key name in Task 6 matches the `@@unique([recurrenceId, recurrenceDate])` in Task 1. ✓
