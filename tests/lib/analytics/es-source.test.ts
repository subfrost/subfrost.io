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
