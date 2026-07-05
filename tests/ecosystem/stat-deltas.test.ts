import { describe, it, expect } from "vitest"
import { computeStatDeltas, computePeriodLabel } from "@/lib/ecosystem/stat-deltas"
import type { ProjectStats } from "@/lib/ecosystem/stats-types"

const gen = (over: Record<string, unknown>) => ({
  name: "ARBUZ", symbol: "ARBUZ", holders: 1000, supply: "100000",
  priceUsd: 0.01, marketcapUsd: 2000, volume24hUsd: 10, ...over,
})
const stats = (over: Partial<ProjectStats>): ProjectStats => ({
  generic: { "2:25349": gen({}) },
  custom: [{ key: "jackpot", label: "Jackpot", value: "10.00", unit: "DIESEL" }],
  ...over,
})

describe("computeStatDeltas", () => {
  it("returns {} when baseline is null", () => {
    expect(computeStatDeltas(stats({}), null, "2:25349")).toEqual({})
  })

  it("computes up/down/flat for generic holders/price", () => {
    const current = stats({ generic: { "2:25349": gen({ holders: 1234, priceUsd: 0.008 }) } })
    const baseline = stats({ generic: { "2:25349": gen({ holders: 1000, priceUsd: 0.01 }) } })
    const d = computeStatDeltas(current, baseline, "2:25349")
    expect(d["generic-holders"]).toEqual({ deltaPct: 0.234, direction: "up" })
    expect(d["generic-price"].direction).toBe("down")
    expect(d["generic-price"].deltaPct).toBeCloseTo(-0.2, 5)
    expect(d["generic-supply"]).toEqual({ deltaPct: 0, direction: "flat" }) // supply igual "100000"
  })

  it("compares supply as a number (string field)", () => {
    const current = stats({ generic: { "2:25349": gen({ supply: "110000" }) } })
    const baseline = stats({ generic: { "2:25349": gen({ supply: "100000" }) } })
    expect(computeStatDeltas(current, baseline, "2:25349")["generic-supply"]).toEqual({ deltaPct: 0.1, direction: "up" })
  })

  it("skips a metric when the baseline value is zero (no div-by-zero)", () => {
    const current = stats({ generic: { "2:25349": gen({ holders: 5 }) } })
    const baseline = stats({ generic: { "2:25349": gen({ holders: 0 }) } })
    expect(computeStatDeltas(current, baseline, "2:25349")["generic-holders"]).toBeUndefined()
  })

  it("skips a metric when a value is null (holders null → not comparable)", () => {
    const current = stats({ generic: { "2:25349": gen({ holders: null }) } })
    const baseline = stats({ generic: { "2:25349": gen({ holders: 100 }) } })
    expect(computeStatDeltas(current, baseline, "2:25349")["generic-holders"]).toBeUndefined()
  })

  it("computes custom deltas by key and skips non-numeric composite values", () => {
    const current = stats({
      custom: [
        { key: "jackpot", label: "Jackpot", value: "15.04" },
        { key: "tickets", label: "Tickets", value: "42 / 1337" },
      ],
    })
    const baseline = stats({
      custom: [
        { key: "jackpot", label: "Jackpot", value: "12.00" },
        { key: "tickets", label: "Tickets", value: "40 / 1300" },
      ],
    })
    const d = computeStatDeltas(current, baseline, "2:25349")
    expect(d["custom-jackpot"].direction).toBe("up")
    expect(d["custom-tickets"]).toBeUndefined() // "42 / 1337" → NaN → pulado
  })

  it("skips a custom key absent from the baseline", () => {
    const current = stats({ custom: [{ key: "new", label: "New", value: "5" }] })
    const baseline = stats({ custom: [{ key: "old", label: "Old", value: "5" }] })
    expect(computeStatDeltas(current, baseline, "2:25349")["custom-new"]).toBeUndefined()
  })

  it("skips generics when mainAlkaneId is null", () => {
    const d = computeStatDeltas(stats({}), stats({}), null)
    expect(d["generic-holders"]).toBeUndefined()
  })
})

describe("computePeriodLabel", () => {
  const base = new Date("2026-07-05T18:00:00Z")
  it("returns null without a baseline", () => {
    expect(computePeriodLabel(base, null)).toBeNull()
  })
  it("returns 24h when the gap is ~24h or more", () => {
    expect(computePeriodLabel(base, new Date("2026-07-04T18:00:00Z"))).toBe("24h")
    expect(computePeriodLabel(base, new Date("2026-07-04T17:00:00Z"))).toBe("24h") // 25h
  })
  it("returns <n>h during bootstrap (<23h of history)", () => {
    expect(computePeriodLabel(base, new Date("2026-07-05T06:00:00Z"))).toBe("12h")
  })
})
