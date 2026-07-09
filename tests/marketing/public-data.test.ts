import { describe, it, expect, vi, beforeEach } from "vitest"

const snapshotStore = vi.hoisted(() => ({ listDailySnapshots: vi.fn() }))
vi.mock("@/lib/marketing/snapshot-store", () => snapshotStore)

const stats = vi.hoisted(() => ({
  getStats: vi.fn(),
  normalizeHomeStats: (v: unknown) => v, // pass-through; real one only fills nulls
}))
vi.mock("@/lib/stats", () => stats)

import { getPublicData, isPublicMetricKey, formatMetricValue, CARD_METRICS } from "@/lib/marketing/public-data"

function row(dayOffset: number, over: Partial<{ holders: number; priceUsd: number; btcLocked: number }> = {}) {
  const d = new Date(Date.UTC(2026, 5, 1 + dayOffset)) // 2026-06-01 + offset
  return {
    id: `s${dayOffset}`,
    createdAt: d,
    label: "daily",
    context: "DAILY",
    payload: {
      protocol: { totalBtcLocked: over.btcLocked ?? 90 + dayOffset, btcUsd: 60000 },
      tokens: {
        diesel: { holders: over.holders ?? 7000 + dayOffset, priceUsd: over.priceUsd ?? 50, marketcapUsd: 33000000 },
        fire: { priceUsd: 40 },
        frbtc: { supply: "9334766521" },
      },
      ratios: { btcDiesel: 1165.9, btcFire: 1420.3 },
    },
  }
}

beforeEach(() => {
  stats.getStats.mockResolvedValue({
    totalBtcLocked: 94.74, currentFrbtcSupply: 93.34766521,
    dieselUsd: 50.13, fireUsd: 40.23, btcDieselPrice: 1165.9, btcFirePrice: 1420.3,
  })
})

describe("getPublicData", () => {
  it("assembles now-values from live stats and series from snapshots", async () => {
    snapshotStore.listDailySnapshots.mockResolvedValue(Array.from({ length: 10 }, (_, i) => row(i)))
    const p = await getPublicData()
    expect(p.seriesDays).toBe(10)
    expect(p.series[0].dieselHolders).toBe(7000)
    expect(p.now["btc-locked"]).toBe(94.74)
    expect(p.now["diesel-holders"]).toBe(7009) // holders come from latest snapshot, not live stats
    expect(p.updatedAt).toBe("2026-06-10T00:00:00.000Z")
  })

  it("computes 7d deltas from the series (latest vs >=7 days earlier)", async () => {
    snapshotStore.listDailySnapshots.mockResolvedValue(Array.from({ length: 10 }, (_, i) => row(i)))
    const p = await getPublicData()
    // holders: latest 7009 vs baseline 7002 (7 days earlier) => +0.1%
    expect(p.deltas7d["diesel-holders"]).toBeCloseTo(((7009 - 7002) / 7002) * 100, 5)
  })

  it("single point: series ok, deltas null", async () => {
    snapshotStore.listDailySnapshots.mockResolvedValue([row(0)])
    const p = await getPublicData()
    expect(p.seriesDays).toBe(1)
    expect(p.deltas7d["diesel-holders"]).toBeNull()
  })

  it("empty snapshots: nulls where live stats have no value, never throws", async () => {
    snapshotStore.listDailySnapshots.mockResolvedValue([])
    const p = await getPublicData()
    expect(p.seriesDays).toBe(0)
    expect(p.now["diesel-holders"]).toBeNull()
    expect(p.now["btc-locked"]).toBe(94.74)
    expect(p.updatedAt).toBeNull()
  })

  it("snapshot store throwing does not break the payload (falls back to live-only)", async () => {
    snapshotStore.listDailySnapshots.mockRejectedValue(new Error("db down"))
    const p = await getPublicData()
    expect(p.seriesDays).toBe(0)
    expect(p.now["btc-locked"]).toBe(94.74)
  })

  it("live stats throwing falls back to latest snapshot values", async () => {
    stats.getStats.mockRejectedValue(new Error("boom"))
    snapshotStore.listDailySnapshots.mockResolvedValue(Array.from({ length: 3 }, (_, i) => row(i)))
    const p = await getPublicData()
    expect(p.now["btc-locked"]).toBe(92) // 90 + 2 from latest snapshot
  })

  it("frbtc-supply series is normalized to BTC scale (raw base-units / 1e8)", async () => {
    snapshotStore.listDailySnapshots.mockResolvedValue(Array.from({ length: 3 }, (_, i) => row(i)))
    const p = await getPublicData()
    for (const point of p.series) {
      expect(point.frbtcSupply).toBe(93.34766521)
    }
  })

  it("frbtc-supply now-value matches series scale when live stats are down (BTC, not raw base-units)", async () => {
    stats.getStats.mockRejectedValue(new Error("boom"))
    snapshotStore.listDailySnapshots.mockResolvedValue(Array.from({ length: 3 }, (_, i) => row(i)))
    const p = await getPublicData()
    expect(p.now["frbtc-supply"]).toBe(93.34766521)
  })
})

describe("helpers", () => {
  it("isPublicMetricKey", () => {
    expect(isPublicMetricKey("btc-locked")).toBe(true)
    expect(isPublicMetricKey("nope")).toBe(false)
    // DIESEL/BTC and FIRE/BTC ratio cards were removed from /metrics
    expect(isPublicMetricKey("btc-diesel")).toBe(false)
    expect(isPublicMetricKey("btc-fire")).toBe(false)
  })
  it("formatMetricValue by kind", () => {
    expect(formatMetricValue("diesel-holders", 7938)).toBe("7,938")
    expect(formatMetricValue("diesel-price", 50.13)).toBe("$50.13")
    expect(formatMetricValue("btc-locked", 94.74)).toBe("94.74 BTC")
    expect(formatMetricValue("btc-locked", null)).toBe("—")
    expect(formatMetricValue("frbtc-supply", 93.34766521)).toBe("93.35 BTC")
  })
  it("does not expose the removed DIESEL/BTC and FIRE/BTC ratio cards", () => {
    expect(Object.keys(CARD_METRICS)).not.toContain("btc-diesel")
    expect(Object.keys(CARD_METRICS)).not.toContain("btc-fire")
  })
  it("every metric maps to a real SeriesPoint field", () => {
    const fields = ["date","dieselHolders","dieselPrice","btcLocked","firePrice","frbtcSupply","dieselMarketcap","btcUsd","btcDiesel","btcFire"]
    for (const m of Object.values(CARD_METRICS)) expect(fields).toContain(m.seriesField)
  })
})
