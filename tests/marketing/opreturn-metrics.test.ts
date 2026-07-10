import { it, expect } from "vitest"
import { computeMetric, computeBytesComposition, dayValue, formatMetricValue } from "@/lib/marketing/opreturn-metrics"
import type { OpReturnRow } from "@/lib/marketing/opreturn-types"

// runestoneBytes INCLUDES alkanesBytes (Alkanes protostones are embedded in runestones),
// so realistic rows always have runestoneBytes >= alkanesBytes.
const row = (over: Partial<OpReturnRow>): OpReturnRow => ({
  date: "2026-01-01", fromHeight: 0, toHeight: 0, blocksScanned: 1,
  totalTx: 100, txWithOpReturn: 80, txAlkanes: 50, opReturnBytes: 1000,
  runestoneBytes: 750, alkanesBytes: 700, dieselMints: 49,
  feeTotalSats: 1000, feeAlkanesSats: 100, feeOpReturnSats: 500, btcUsd: 100000, ...over,
})

it("dayValue computes a share and guards divide-by-zero", () => {
  expect(dayValue(row({ txAlkanes: 50, totalTx: 100 }), "alkanesTxShare")).toBeCloseTo(0.5)
  expect(dayValue(row({ totalTx: 0 }), "alkanesTxShare")).toBeNull()
})

it("computeMetric ratio uses ratio-of-sums over the window", () => {
  const rows = [row({ date: "2026-01-01", txAlkanes: 10, totalTx: 100 }), row({ date: "2026-01-02", txAlkanes: 90, totalTx: 100 })]
  // avg7 covers both days: (10+90)/(100+100) = 0.5
  expect(computeMetric(rows, "alkanesTxShare", "avg7").value).toBeCloseTo(0.5)
  // latest = last day only: 90/100 = 0.9
  expect(computeMetric(rows, "alkanesTxShare", "latest").value).toBeCloseTo(0.9)
})

it("computeMetric usd cumulative sums daily USD over the window", () => {
  const rows = [row({ feeAlkanesSats: 100_000_000, btcUsd: 50000 }), row({ date: "2026-01-02", feeAlkanesSats: 200_000_000, btcUsd: 50000 })]
  // 1 BTC*50k + 2 BTC*50k = 150000
  expect(computeMetric(rows, "alkanesFeeUsdCumulative", "full").value).toBeCloseTo(150000)
  expect(computeMetric(rows, "alkanesFeeUsdCumulative", "full").format).toBe("usd")
})

it("computeBytesComposition subtracts alkanes out of runestone bytes (embedded protostones, not disjoint buckets)", () => {
  // Mirrors real-chain proportions (~81% alkanes / ~9.5% runes / ~9% other): the runes slice
  // is runestone-minus-alkanes, and other is everything outside runestones.
  const c = computeBytesComposition([row({ opReturnBytes: 1000, alkanesBytes: 812, runestoneBytes: 907 })], "full")
  expect(c.alkanes).toBeCloseTo(0.812, 10)
  expect(c.runes).toBeCloseTo(0.907 - 0.812, 10)
  expect(c.runes).toBeCloseTo(0.095, 3)
  expect(c.other).toBeCloseTo(1 - 0.907, 10)
  expect(c.other).toBeCloseTo(0.093, 3)
})

it("computeBytesComposition aggregates ratio-of-sums over the selected window", () => {
  const rows = [
    // day 1: fully-alkanes runestones; day 2: pure-runes runestones
    row({ date: "2026-01-01", opReturnBytes: 1000, alkanesBytes: 1000, runestoneBytes: 1000 }),
    row({ date: "2026-01-02", opReturnBytes: 1000, alkanesBytes: 0, runestoneBytes: 1000 }),
  ]
  const full = computeBytesComposition(rows, "full")
  expect(full.alkanes).toBeCloseTo(0.5, 10)
  expect(full.runes).toBeCloseTo(0.5, 10)
  expect(full.other).toBeCloseTo(0, 10)
  const latest = computeBytesComposition(rows, "latest")
  expect(latest.alkanes).toBeCloseTo(0, 10)
  expect(latest.runes).toBeCloseTo(1, 10)
})

it("computeBytesComposition clamps runes to 0 (not negative) when alkanesBytes exceeds runestoneBytes (bad data)", () => {
  const c = computeBytesComposition([row({ opReturnBytes: 1000, alkanesBytes: 700, runestoneBytes: 400 })], "full")
  expect(c.alkanes).toBeCloseTo(0.7, 10)
  expect(c.runes).toBe(0)
})

it("computeBytesComposition clamps other to 0 (not negative) when runestoneBytes exceeds opReturnBytes (bad data)", () => {
  const c = computeBytesComposition([row({ opReturnBytes: 1000, alkanesBytes: 300, runestoneBytes: 1200 })], "full")
  expect(c.other).toBe(0)
})

it("alkanesFeeUsdDaily aggregates as the mean daily USD over the window", () => {
  const rows = [row({ feeAlkanesSats: 100_000_000, btcUsd: 50000 }), row({ date: "2026-01-02", feeAlkanesSats: 300_000_000, btcUsd: 50000 })]
  // daily USD = 50000 and 150000 -> mean = 100000
  expect(computeMetric(rows, "alkanesFeeUsdDaily", "full").value).toBeCloseTo(100000)
})

it("computeMetric ratio returns null when the window denominator is all zero", () => {
  expect(computeMetric([row({ totalTx: 0, txAlkanes: 0 })], "alkanesTxShare", "full").value).toBeNull()
})

it("computeBytesComposition returns zeros when there are no OP_RETURN bytes", () => {
  expect(computeBytesComposition([row({ opReturnBytes: 0, alkanesBytes: 0, runestoneBytes: 0 })], "full")).toEqual({ alkanes: 0, runes: 0, other: 0 })
})

it("alkanesWeightShare is a null-safe ratio over rows that have weight data", () => {
  const rows = [
    row({ date: "2026-01-01", weightAlkanes: 10, weightTotal: 100 }),
    row({ date: "2026-01-02", weightAlkanes: null, weightTotal: null }), // old CSV row → skipped
    row({ date: "2026-01-03", weightAlkanes: 30, weightTotal: 100 }),
  ]
  // (10+30)/(100+100) = 0.2 — the null row contributes nothing
  expect(computeMetric(rows, "alkanesWeightShare", "full").value).toBeCloseTo(0.2)
})

it("alkanesRunestoneTxShare = alkanes / (alkanes + pure runes), null-safe", () => {
  const rows = [row({ txAlkRunestone: 3, txPureRunes: 1 })]
  expect(computeMetric(rows, "alkanesRunestoneTxShare", "full").value).toBeCloseTo(0.75)
  expect(computeMetric([row({ txAlkRunestone: null, txPureRunes: null })], "alkanesRunestoneTxShare", "full").value).toBeNull()
})

it("dieselMintedCumulative sums diesel mints over the window", () => {
  const rows = [row({ dieselMints: 40 }), row({ date: "2026-01-02", dieselMints: 60 })]
  expect(computeMetric(rows, "dieselMintedCumulative", "full").value).toBeCloseTo(100)
  expect(computeMetric(rows, "dieselMintedCumulative", "full").format).toBe("count")
})

it("sum metrics get a monotonic running-sum series (cumulative sparkline)", () => {
  const rows = [row({ date: "2026-01-01", dieselMints: 40 }), row({ date: "2026-01-02", dieselMints: 60 })]
  const s = computeMetric(rows, "dieselMintedCumulative", "full").series
  expect(s.map((p) => p.value)).toEqual([40, 100]) // running sum, not [40, 60]
})

it("dieselTxShareOfAll is a ratio with per100 format", () => {
  const r = computeMetric([row({ dieselMints: 2, totalTx: 100 })], "dieselTxShareOfAll", "full")
  expect(r.value).toBeCloseTo(0.02)
  expect(r.format).toBe("per100")
})

it("formatMetricValue renders each format", () => {
  expect(formatMetricValue(0.042, "pct")).toBe("4.2%")
  expect(formatMetricValue(1234, "usd")).toBe("$1,234")
  // per100: a mints:tx ratio shown as a count per 100 tx ("50 per 100 Bitcoin transactions"),
  // honest even when >1 mint rides in a single tx (unlike a "% of transactions" reading).
  expect(formatMetricValue(0.5, "per100")).toBe("50")   // round(0.5*100)=50
  expect(formatMetricValue(1_250_000, "count")).toBe("1.3M")
  expect(formatMetricValue(null, "pct")).toBe("—")
})

it("computeMetric reports the metric format", () => {
  expect(computeMetric([row({})], "alkanesWeightShare", "full").format).toBe("pct")
})

it("ytd window keeps only rows dated in the latest row's year", () => {
  const rows = [
    row({ date: "2025-12-30", txAlkanes: 100, totalTx: 100 }), // prior year → excluded
    row({ date: "2026-01-05", txAlkanes: 10, totalTx: 100 }),
    row({ date: "2026-02-05", txAlkanes: 30, totalTx: 100 }),
  ]
  // ytd = 2026 rows only: (10+30)/(100+100) = 0.2 (the 2025 row is dropped)
  expect(computeMetric(rows, "alkanesTxShare", "ytd").value).toBeCloseTo(0.2)
})
