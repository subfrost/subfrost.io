import { describe, it, expect, vi } from "vitest"

const store = vi.hoisted(() => ({ listOpReturnDaily: vi.fn() }))
vi.mock("@/lib/marketing/opreturn-store", () => store)

import { getPublicOpReturnData } from "@/lib/marketing/public-opreturn"
import type { OpReturnRow } from "@/lib/marketing/opreturn-types"

function row(date: string, over: Partial<OpReturnRow> = {}): OpReturnRow {
  return {
    date, fromHeight: 900000, toHeight: 900100, blocksScanned: 100,
    totalTx: 300000, txWithOpReturn: 150000, txAlkanes: 24000,
    opReturnBytes: 1_500_000, runestoneBytes: 1_300_000, alkanesBytes: 500_000, dieselMints: 23000,
    feeTotalSats: 160_000_000, feeAlkanesSats: 1_600_000, feeOpReturnSats: 12_000_000, btcUsd: 60000,
    ...over,
  }
}

describe("getPublicOpReturnData", () => {
  it("derives all line series from the rows", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01"), row("2026-06-02", { txAlkanes: 30000, opReturnBytes: 2_000_000 })])
    const p = await getPublicOpReturnData()
    expect(p.days).toBe(2)
    expect(p.updatedAt).toBe("2026-06-02")
    expect(p.lines.alkanesTxShare[0].value).toBeCloseTo(24000 / 300000, 10)
    expect(p.lines.alkanesOpReturnShare[1].value).toBeCloseTo(30000 / 150000, 10)
    expect(p.lines.dieselTxShare[0].value).toBeCloseTo(23000 / 300000, 10)
    expect(p.lines.opReturnBytesPerTx[0].value).toBeCloseTo(1_500_000 / 150000, 10)
    expect(p.lines.feesTotalBtc[0].value).toBeCloseTo(1.6, 10)
    expect(p.lines.alkanesFeeShare[0].value).toBeCloseTo(1_600_000 / 160_000_000, 10)
  })

  it("accumulates opReturnBytesCum as a running sum", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01"), row("2026-06-02", { opReturnBytes: 2_000_000 })])
    const p = await getPublicOpReturnData()
    expect(p.lines.opReturnBytesCum[0].value).toBe(1_500_000)
    expect(p.lines.opReturnBytesCum[1].value).toBe(3_500_000)
  })

  it("builds the stacked fees series and the latest-day donut", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01")])
    const p = await getPublicOpReturnData()
    expect(p.feesStacked[0]).toEqual({ date: "2026-06-01", alkanes: 1_600_000 / 1e8, rest: (160_000_000 - 1_600_000) / 1e8 })
    expect(p.latestDonut).toEqual({ alkanes: 24000, other: 150000 - 24000 })
  })

  it("yields null values where denominators are zero", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { totalTx: 0, txWithOpReturn: 0, feeTotalSats: 0 })])
    const p = await getPublicOpReturnData()
    expect(p.lines.alkanesTxShare[0].value).toBeNull()
    expect(p.lines.alkanesOpReturnShare[0].value).toBeNull()
    expect(p.lines.opReturnBytesPerTx[0].value).toBeNull()
    expect(p.lines.alkanesFeeShare[0].value).toBeNull()
    expect(p.latestDonut).toBeNull() // txWithOpReturn 0 -> no meaningful donut
  })

  it("empty table: empty payload, never throws", async () => {
    store.listOpReturnDaily.mockResolvedValue([])
    const p = await getPublicOpReturnData()
    expect(p.days).toBe(0)
    expect(p.updatedAt).toBeNull()
    expect(p.latestDonut).toBeNull()
    expect(p.lines.alkanesTxShare).toEqual([])
    expect(p.feesStacked).toEqual([])
  })

  it("store throwing: same empty payload, never throws", async () => {
    store.listOpReturnDaily.mockRejectedValue(new Error("db down"))
    const p = await getPublicOpReturnData()
    expect(p.days).toBe(0)
  })
})
