import { describe, it, expect } from "vitest"
import { CHART_SPECS, parseChartParams, chartImageUrl } from "@/lib/marketing/chart-specs"

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/

// Hardcoded id list, the append-only contract for /metrics chart export. Never remove or
// rename an id here without also migrating CHART_SPECS (see lib/marketing/chart-specs.ts).
const KNOWN_IDS = [
  "daily-alkanes-share",
  "alkanes-share-of-opreturn",
  "alkanes-weight-share",
  "four-answers",
  "last-day-composition",
  "diesel-tx-share",
  "diesel-mints-per-day",
  "diesel-mints-cumulative",
  "ug-diesel-share",
  "ug-mints-per-day",
  "runes-vs-alkanes-share",
  "runes-vs-alkanes-bytes",
  "byte-composition",
  "runestone-tx-share",
  "runestone-tx-count",
  "bytes-donut",
  "bytes-per-tx",
  "miner-revenue-usd",
  "fees-split-btc",
  "alkanes-fee-share",
  "fee-per-tx",
]

describe("CHART_SPECS", () => {
  it("has exactly the 21 known /metrics chart ids", () => {
    expect(Object.keys(CHART_SPECS).sort()).toEqual([...KNOWN_IDS].sort())
    expect(KNOWN_IDS.length).toBe(21)
  })

  it("every entry has at least one series, or donutSlices for type:donut", () => {
    for (const id of KNOWN_IDS) {
      const spec = CHART_SPECS[id]
      expect(spec, `missing spec for ${id}`).toBeDefined()
      expect(spec.id).toBe(id)
      if (spec.type === "donut") {
        expect(spec.donutSlices?.length ?? 0, `${id} donutSlices`).toBeGreaterThan(0)
      } else {
        expect(spec.series.length, `${id} series`).toBeGreaterThan(0)
      }
    }
  })

  it("every series and donutSlices color is a hex color", () => {
    for (const id of KNOWN_IDS) {
      const spec = CHART_SPECS[id]
      for (const s of spec.series) {
        expect(s.color, `${id} series ${s.key} color`).toMatch(HEX_RE)
      }
      for (const s of spec.donutSlices ?? []) {
        expect(s.color, `${id} donutSlices ${s.key} color`).toMatch(HEX_RE)
      }
    }
  })
})

describe("parseChartParams", () => {
  it("returns null for an unknown id", () => {
    expect(parseChartParams(new URLSearchParams("id=totally-made-up"))).toBeNull()
  })

  it("returns null for an unknown window", () => {
    expect(parseChartParams(new URLSearchParams("id=diesel-mints-per-day&window=avg9999"))).toBeNull()
  })

  it("returns null for an unknown theme", () => {
    expect(parseChartParams(new URLSearchParams("id=diesel-mints-per-day&theme=neon"))).toBeNull()
  })

  it("returns null when id is missing", () => {
    expect(parseChartParams(new URLSearchParams(""))).toBeNull()
  })

  it("returns null for Object.prototype member ids (prototype pollution guard)", () => {
    expect(parseChartParams(new URLSearchParams("id=toString&window=full&theme=dark"))).toBeNull()
    expect(parseChartParams(new URLSearchParams("id=__proto__&window=full&theme=dark"))).toBeNull()
  })

  it("returns the spec for a known id with default window/theme", () => {
    const result = parseChartParams(new URLSearchParams("id=diesel-mints-per-day"))
    expect(result).not.toBeNull()
    expect(result?.spec.id).toBe("diesel-mints-per-day")
    expect(result?.window).toBe("full")
    expect(result?.theme).toBe("dark")
  })

  it("accepts an explicit valid window and theme", () => {
    const result = parseChartParams(new URLSearchParams("id=byte-composition&window=avg30&theme=light"))
    expect(result).not.toBeNull()
    expect(result?.spec.id).toBe("byte-composition")
    expect(result?.window).toBe("avg30")
    expect(result?.theme).toBe("light")
  })
})

describe("chartImageUrl", () => {
  it("builds the exact expected url", () => {
    expect(chartImageUrl("diesel-mints-per-day", "full")).toBe(
      "https://subfrost.io/metrics/chart/opreturn?id=diesel-mints-per-day&window=full&theme=dark",
    )
  })

  it("accepts an explicit theme", () => {
    expect(chartImageUrl("byte-composition", "avg30", "light")).toBe(
      "https://subfrost.io/metrics/chart/opreturn?id=byte-composition&window=avg30&theme=light",
    )
  })
})
