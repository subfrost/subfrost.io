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
