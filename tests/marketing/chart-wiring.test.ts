import { describe, it, expect } from "vitest"
import { CHART_SPECS } from "@/lib/marketing/chart-specs"
import { CHART_IDS } from "@/components/data/OpReturnCharts"

// Guards Task 5's wiring: every /metrics OP_RETURN chart Card must be wired to a real
// CHART_SPECS id (a wired id with no spec is a bug), and every spec must actually be wired to
// a Card (an unwired spec means a chart is missing its "Copy chart" action). CHART_IDS is the
// component's own source of truth (each Card's chartUrl is built from CHART_ID.<key>, and
// CHART_IDS = Object.values(CHART_ID)), so this test can't drift from what's actually rendered
// without someone editing both places.
describe("OpReturnCharts chart wiring", () => {
  it("wires exactly the 21 CHART_SPECS ids, no more, no fewer", () => {
    expect([...CHART_IDS].sort()).toEqual(Object.keys(CHART_SPECS).sort())
  })

  it("has no duplicate wired ids (one Card per chart)", () => {
    expect(new Set(CHART_IDS).size).toBe(CHART_IDS.length)
  })

  it("every wired id resolves to a real CHART_SPECS entry", () => {
    for (const id of CHART_IDS) {
      expect(CHART_SPECS[id], `wired id "${id}" has no CHART_SPECS entry`).toBeDefined()
    }
  })
})
