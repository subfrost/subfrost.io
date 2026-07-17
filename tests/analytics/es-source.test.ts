import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { analyticsFilters, analyticsQuery } from "@/lib/analytics/es"
import type { DateRange } from "@/lib/analytics/source"

const R: DateRange = { start: "28daysAgo", end: "today", preset: "28d" }

describe("analyticsFilters", () => {
  const prev = process.env.ANALYTICS_INSTANCE
  beforeEach(() => { delete process.env.ANALYTICS_INSTANCE })
  afterEach(() => { if (prev === undefined) delete process.env.ANALYTICS_INSTANCE; else process.env.ANALYTICS_INSTANCE = prev })

  it("unset → só filtro de range (paridade com prod)", () => {
    const f = analyticsFilters(R)
    expect(f).toHaveLength(1)
    expect(f[0]).toHaveProperty("range.ts")
  })

  it("edge-middleware → range + instance, SEM kind", () => {
    process.env.ANALYTICS_INSTANCE = "edge-middleware"
    const f = analyticsFilters(R)
    expect(f).toHaveLength(2)
    expect(f[1]).toEqual({ term: { instance: "edge-middleware" } })
    expect(f.some((x) => JSON.stringify(x).includes('"kind"'))).toBe(false)
  })

  it("tlsd-core → range + instance + kind:page", () => {
    process.env.ANALYTICS_INSTANCE = "tlsd-core"
    const f = analyticsFilters(R)
    expect(f).toHaveLength(3)
    expect(f[1]).toEqual({ term: { instance: "tlsd-core" } })
    expect(f[2]).toEqual({ term: { kind: "page" } })
  })

  it("analyticsQuery envelopa analyticsFilters em bool.filter", () => {
    expect(analyticsQuery(R)).toEqual({ bool: { filter: analyticsFilters(R) } })
  })
})
