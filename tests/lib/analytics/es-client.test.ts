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
