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

describe("GA4 normalizers", () => {
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
})
