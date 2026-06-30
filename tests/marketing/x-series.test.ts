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
