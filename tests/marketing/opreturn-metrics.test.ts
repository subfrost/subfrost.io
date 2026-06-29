import { it, expect } from "vitest"
import { computeMetric, computeBytesComposition, dayValue } from "@/lib/marketing/opreturn-metrics"
import type { OpReturnRow } from "@/lib/marketing/opreturn-types"

const row = (over: Partial<OpReturnRow>): OpReturnRow => ({
  date: "2026-01-01", fromHeight: 0, toHeight: 0, blocksScanned: 1,
  totalTx: 100, txWithOpReturn: 80, txAlkanes: 50, opReturnBytes: 1000,
  runestoneBytes: 200, alkanesBytes: 700, dieselMints: 49,
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
  expect(computeMetric(rows, "alkanesFeeUsdCumulative", "full").kind).toBe("usd")
})

it("computeBytesComposition splits alkanes/runes/other by ratio-of-sums", () => {
  const c = computeBytesComposition([row({ opReturnBytes: 1000, alkanesBytes: 700, runestoneBytes: 200 })], "full")
  expect(c.alkanes).toBeCloseTo(0.7)
  expect(c.runes).toBeCloseTo(0.2)
  expect(c.other).toBeCloseTo(0.1)
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
