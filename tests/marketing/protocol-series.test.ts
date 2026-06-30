import { describe, it, expect } from "vitest"
import type { SnapshotRow } from "@/lib/marketing/snapshot-store"
import type { SnapshotPayload } from "@/lib/marketing/types"
import { buildProtocolSeries, pickBaseline, kpiDelta } from "@/lib/marketing/protocol-series"

function payload(o: { holders?: number | null; price?: number | null; locked?: number | null }): SnapshotPayload {
  const tok = (over: Partial<SnapshotPayload["tokens"]["diesel"]> = {}) => ({
    id: "2:0", name: null, symbol: null, holders: null, priceUsd: null, supply: null,
    marketcapUsd: null, fdvUsd: null, volume24hUsd: null,
    priceChange24h: null, priceChange7d: null, priceChange30d: null, ...over,
  })
  return {
    capturedAt: "2026-06-30T00:05:00.000Z",
    protocol: { totalBtcLocked: o.locked ?? null, alkanesBtcLocked: null, brc20BtcLocked: null, btcUsd: 98000, btcHeight: null, metashrewHeight: null, source: "store" },
    tokens: { diesel: tok({ holders: o.holders ?? null, priceUsd: o.price ?? null, marketcapUsd: 36_000_000 }), fire: tok({ priceUsd: 0.9 }), frbtc: tok({ supply: "152" }) },
    ratios: { btcDiesel: 0.028, btcFire: 0.01 },
    partial: false,
  }
}
const row = (date: string, o: Parameters<typeof payload>[0]): SnapshotRow => ({
  id: date, createdAt: new Date(date), label: "Daily", context: "DAILY",
  refUrl: null, articleId: null, note: null, createdByName: null, articleSlug: null, payload: payload(o),
})

describe("buildProtocolSeries", () => {
  it("flattens rows to plottable points with a YYYY-MM-DD date, in order", () => {
    const out = buildProtocolSeries([
      row("2026-06-28T00:05:00Z", { holders: 12600, price: 2.6, locked: 144 }),
      row("2026-06-29T00:05:00Z", { holders: 12790, price: 2.71, locked: 147.9 }),
    ])
    expect(out.map((p) => p.date)).toEqual(["2026-06-28", "2026-06-29"])
    expect(out[1]).toMatchObject({ dieselHolders: 12790, dieselPrice: 2.71, btcLocked: 147.9, btcUsd: 98000 })
  })
  it("passes nulls through for missing fields (partial snapshot)", () => {
    const out = buildProtocolSeries([row("2026-06-29T00:05:00Z", { holders: null, price: null, locked: null })])
    expect(out[0]).toMatchObject({ dieselHolders: null, dieselPrice: null, btcLocked: null })
  })
})

describe("pickBaseline", () => {
  const rows = [
    row("2026-06-20T00:05:00Z", { holders: 12000 }),
    row("2026-06-23T00:05:00Z", { holders: 12300 }),
    row("2026-06-30T00:05:00Z", { holders: 12847 }),
  ]
  it("picks the nearest row on-or-before latest minus N days", () => {
    expect(pickBaseline(rows, 7)?.id).toBe("2026-06-23T00:05:00Z")
  })
  it("returns null when no row is old enough", () => {
    expect(pickBaseline(rows, 30)).toBeNull()
  })
  it("returns null for an empty series", () => {
    expect(pickBaseline([], 7)).toBeNull()
  })
})

describe("kpiDelta", () => {
  it("computes abs + pct delta of a diff path vs the baseline N days back", () => {
    const rows = [row("2026-06-23T00:05:00Z", { holders: 12300 }), row("2026-06-30T00:05:00Z", { holders: 12847 })]
    const d = kpiDelta(rows, "tokens.diesel.holders", 7)
    expect(d.deltaAbs).toBe(547)
    expect(d.deltaPct).toBeCloseTo(4.447, 2)
  })
  it("returns nulls when there is no baseline far enough back", () => {
    const rows = [row("2026-06-29T00:05:00Z", { holders: 12790 }), row("2026-06-30T00:05:00Z", { holders: 12847 })]
    expect(kpiDelta(rows, "tokens.diesel.holders", 7)).toEqual({ deltaAbs: null, deltaPct: null })
  })
})
