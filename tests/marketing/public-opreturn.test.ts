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
  it("derives dailyShare and opReturnShare series", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01"),
      row("2026-06-02", { txAlkanes: 30000, opReturnBytes: 2_000_000, alkanesBytes: 600_000 }),
    ])
    const p = await getPublicOpReturnData()
    expect(p.days).toBe(2)
    expect(p.updatedAt).toBe("2026-06-02")

    expect(p.dailyShare[0].txShare).toBeCloseTo(24000 / 300000, 10)
    expect(p.dailyShare[0].opReturnPenetration).toBeCloseTo(150000 / 300000, 10)
    expect(p.dailyShare[1].txShare).toBeCloseTo(30000 / 300000, 10)
    expect(p.dailyShare[1].opReturnPenetration).toBeCloseTo(150000 / 300000, 10)

    expect(p.opReturnShare[0].txPct).toBeCloseTo(24000 / 150000, 10)
    expect(p.opReturnShare[0].bytesPct).toBeCloseTo(500_000 / 1_500_000, 10)
    expect(p.opReturnShare[1].txPct).toBeCloseTo(30000 / 150000, 10)
    expect(p.opReturnShare[1].bytesPct).toBeCloseTo(600_000 / 2_000_000, 10)
  })

  it("builds the 3-slice donut from the last row, clamping when dieselMints > txAlkanes", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01")])
    let p = await getPublicOpReturnData()
    expect(p.latestDonut).toEqual({
      date: "2026-06-01",
      diesel: 23000,
      alkanesOther: 24000 - 23000,
      other: 150000 - 24000,
    })

    // dieselMints > txAlkanes: alkanesOther must clamp to 0, not go negative
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { dieselMints: 26000 })])
    p = await getPublicOpReturnData()
    expect(p.latestDonut).toEqual({
      date: "2026-06-01",
      diesel: 26000,
      alkanesOther: 0,
      other: 150000 - 24000,
    })
  })

  it("is null when the last row's txWithOpReturn is 0", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { txWithOpReturn: 0 })])
    const p = await getPublicOpReturnData()
    expect(p.latestDonut).toBeNull()
  })

  it("derives dieselTxShare", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01")])
    const p = await getPublicOpReturnData()
    expect(p.dieselTxShare[0].value).toBeCloseTo(23000 / 300000, 10)
  })

  it("computes bytesComposition as all-time fractions, subtracting alkanes out of runestone bytes (protostones are embedded in runestones, not disjoint)", async () => {
    // Realistic fixture: runestoneBytes INCLUDES alkanesBytes (alkanes protostones live inside
    // runestones), so runes' true share is runestoneBytes-minus-alkanesBytes, not runestoneBytes alone.
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { opReturnBytes: 1_604_952, runestoneBytes: 1_392_270, alkanesBytes: 520_627 }),
    ])
    const p = await getPublicOpReturnData()
    const sumOpReturn = 1_604_952
    const a = 520_627 / sumOpReturn
    const rTot = 1_392_270 / sumOpReturn
    const expectedAlkanes = a
    const expectedRunes = rTot - a
    const expectedOther = 1 - rTot
    expect(p.bytesComposition).not.toBeNull()
    expect(p.bytesComposition!.alkanes).toBeCloseTo(expectedAlkanes, 10)
    expect(p.bytesComposition!.alkanes).toBeCloseTo(0.3244, 4)
    expect(p.bytesComposition!.runes).toBeCloseTo(expectedRunes, 10)
    expect(p.bytesComposition!.runes).toBeCloseTo(0.5431, 4)
    expect(p.bytesComposition!.other).toBeCloseTo(expectedOther, 10)
    expect(p.bytesComposition!.other).toBeCloseTo(0.1325, 4)
  })

  it("bytesComposition sums across all rows before deriving fractions (all-time window)", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { opReturnBytes: 1_000_000, runestoneBytes: 900_000, alkanesBytes: 300_000 }),
      row("2026-06-02", { opReturnBytes: 604_952, runestoneBytes: 492_270, alkanesBytes: 220_627 }),
    ])
    const p = await getPublicOpReturnData()
    const sumOpReturn = 1_000_000 + 604_952
    const sumAlkanes = 300_000 + 220_627
    const sumRunestone = 900_000 + 492_270
    const a = sumAlkanes / sumOpReturn
    const rTot = sumRunestone / sumOpReturn
    expect(p.bytesComposition).not.toBeNull()
    expect(p.bytesComposition!.alkanes).toBeCloseTo(a, 10)
    expect(p.bytesComposition!.runes).toBeCloseTo(rTot - a, 10)
    expect(p.bytesComposition!.other).toBeCloseTo(1 - rTot, 10)
  })

  it("bytesComposition is null when total opReturnBytes across all rows is 0", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { opReturnBytes: 0, alkanesBytes: 0, runestoneBytes: 0 }),
    ])
    const p = await getPublicOpReturnData()
    expect(p.bytesComposition).toBeNull()
  })

  it("bytesComposition clamps runes to 0 (not negative) when alkanesBytes exceeds runestoneBytes (bad data)", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { opReturnBytes: 1_000_000, runestoneBytes: 400_000, alkanesBytes: 700_000 }),
    ])
    const p = await getPublicOpReturnData()
    expect(p.bytesComposition).not.toBeNull()
    expect(p.bytesComposition!.runes).toBe(0)
  })

  it("bytesComposition clamps other to 0 (not negative) when runestoneBytes exceeds opReturnBytes (bad data)", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { opReturnBytes: 1_000_000, runestoneBytes: 1_200_000, alkanesBytes: 300_000 }),
    ])
    const p = await getPublicOpReturnData()
    expect(p.bytesComposition).not.toBeNull()
    expect(p.bytesComposition!.other).toBe(0)
  })

  it("bytesComposition ignores the 60d window — uses all rows even when more than 60 exist", async () => {
    const rows: OpReturnRow[] = []
    for (let i = 1; i <= 90; i++) {
      const d = new Date(Date.UTC(2026, 0, 1))
      d.setUTCDate(d.getUTCDate() + (i - 1))
      const dateStr = d.toISOString().slice(0, 10)
      // early rows (excluded from a 60d window) are pure-alkanes; recent 60 are pure-runes
      const over =
        i <= 30
          ? { opReturnBytes: 1000, alkanesBytes: 1000, runestoneBytes: 1000 }
          : { opReturnBytes: 1000, alkanesBytes: 0, runestoneBytes: 1000 }
      rows.push(row(dateStr, over))
    }
    store.listOpReturnDaily.mockResolvedValue(rows)
    const p = await getPublicOpReturnData()
    // If this only used the last-60d window, alkanes fraction would be 0 (all-runes there).
    // Using all 90 rows, the first 30 pure-alkanes rows must still contribute.
    // Here runestoneBytes always equals opReturnBytes (1000) since protostones are embedded in
    // runestones; the first 30 rows have alkanesBytes=1000 too (fully-alkanes runestones).
    expect(p.bytesComposition).not.toBeNull()
    expect(p.bytesComposition!.alkanes).toBeCloseTo(30 / 90, 10)
    // runes = rTot - alkanes; rTot = 90/90 = 1 always; alkanes = 30/90 -> runes = 60/90
    expect(p.bytesComposition!.runes).toBeCloseTo(60 / 90, 10)
  })

  it("derives bytesPerTx alkanes and rest, with null-on-zero-denominator", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01")])
    let p = await getPublicOpReturnData()
    expect(p.bytesPerTx[0].alkanes).toBeCloseTo(500_000 / 24000, 10)
    expect(p.bytesPerTx[0].rest).toBeCloseTo((1_500_000 - 500_000) / (150000 - 24000), 10)

    // txWithOpReturn === txAlkanes -> rest denominator is 0 -> null
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { txWithOpReturn: 24000 })])
    p = await getPublicOpReturnData()
    expect(p.bytesPerTx[0].alkanes).toBeCloseTo(500_000 / 24000, 10)
    expect(p.bytesPerTx[0].rest).toBeNull()
  })

  it("extrapolates minerRevenueUsd per the day-extrapolation formula", async () => {
    // blocksScanned 72 -> factor = 144/72 = 2; feeTotalSats 160_000_000 -> 1.6 BTC; btcUsd 60000
    // (1.6 * 2 + 3.125*144) * 60000 = (3.2 + 450) * 60000
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { blocksScanned: 72 })])
    const p = await getPublicOpReturnData()
    const expected = (1.6 * 2 + 3.125 * 144) * 60000
    expect(p.minerRevenueUsd[0].value).toBeCloseTo(expected, 6)
  })

  it("minerRevenueUsd is null when blocksScanned is 0", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { blocksScanned: 0 })])
    const p = await getPublicOpReturnData()
    expect(p.minerRevenueUsd[0].value).toBeNull()
  })

  it("extrapolates feesSplitBtc alkanes/rest", async () => {
    // blocksScanned 72 -> factor 2; feeAlkanesSats 1_600_000 -> 0.016 BTC * 2 = 0.032
    // rest: (160_000_000 - 1_600_000) / 1e8 * 2
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { blocksScanned: 72 })])
    const p = await getPublicOpReturnData()
    expect(p.feesSplitBtc[0].alkanes).toBeCloseTo((1_600_000 / 1e8) * 2, 10)
    expect(p.feesSplitBtc[0].rest).toBeCloseTo(((160_000_000 - 1_600_000) / 1e8) * 2, 10)
  })

  it("feesSplitBtc is null on both series when blocksScanned is 0", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { blocksScanned: 0 })])
    const p = await getPublicOpReturnData()
    expect(p.feesSplitBtc[0].alkanes).toBeNull()
    expect(p.feesSplitBtc[0].rest).toBeNull()
  })

  it("derives alkanesFeeShare", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01")])
    const p = await getPublicOpReturnData()
    expect(p.alkanesFeeShare[0].value).toBeCloseTo(1_600_000 / 160_000_000, 10)
  })

  it("stats.last30 differs from stats.full when a 31st row exists", async () => {
    const rows: OpReturnRow[] = []
    for (let i = 1; i <= 31; i++) {
      const d = `2026-01-${String(i).padStart(2, "0")}`
      // first row (oldest, excluded from last30) has very different alkanes share
      const over = i === 1 ? { txAlkanes: 1000, alkanesBytes: 1000, feeAlkanesSats: 100, feeOpReturnSats: 100 } : {}
      rows.push(row(d, over))
    }
    store.listOpReturnDaily.mockResolvedValue(rows)
    const p = await getPublicOpReturnData()

    const last30 = rows.slice(-30)
    const full = rows

    const sum = (arr: OpReturnRow[], f: (r: OpReturnRow) => number) => arr.reduce((s, r) => s + f(r), 0)

    expect(p.stats.last30.alkanesOfOpReturnTx).toBeCloseTo(
      sum(last30, (r) => r.txAlkanes) / sum(last30, (r) => r.txWithOpReturn), 10
    )
    expect(p.stats.full.alkanesFeeShare).toBeCloseTo(
      sum(full, (r) => r.feeAlkanesSats) / sum(full, (r) => r.feeTotalSats), 10
    )
    expect(p.stats.last30.alkanesOfOpReturnTx).not.toBeCloseTo(
      sum(full, (r) => r.txAlkanes) / sum(full, (r) => r.txWithOpReturn), 10
    )

    expect(p.stats.last30.alkanesOfOpReturnBytes).toBeCloseTo(
      sum(last30, (r) => r.alkanesBytes) / sum(last30, (r) => r.opReturnBytes), 10
    )
    expect(p.stats.last30.alkanesFeeShare).toBeCloseTo(
      sum(last30, (r) => r.feeAlkanesSats) / sum(last30, (r) => r.feeTotalSats), 10
    )
    expect(p.stats.full.opReturnFeeShare).toBeCloseTo(
      sum(full, (r) => r.feeOpReturnSats) / sum(full, (r) => r.feeTotalSats), 10
    )
    // opReturnFeeShare is windowed like the other last30 stats — the fee-share card compares it
    // against alkanesFeeShare in the SAME window (Alkanes ⊆ OP_RETURN only holds within one window).
    expect(p.stats.last30.opReturnFeeShare).toBeCloseTo(
      sum(last30, (r) => r.feeOpReturnSats) / sum(last30, (r) => r.feeTotalSats), 10
    )
    expect(p.stats.last30.opReturnFeeShare).not.toBeCloseTo(p.stats.full.opReturnFeeShare as number, 10)
    expect(p.stats.full.alkanesBytesPerTx).toBeCloseTo(
      sum(full, (r) => r.alkanesBytes) / sum(full, (r) => r.txAlkanes), 10
    )
  })

  it("stats.latest reflects the last row", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01"),
      row("2026-06-02", { fromHeight: 900100, toHeight: 900200, blocksScanned: 100, txWithOpReturn: 150000, txAlkanes: 30000 }),
    ])
    const p = await getPublicOpReturnData()
    expect(p.stats.latest).toEqual({
      date: "2026-06-02",
      fromHeight: 900100,
      toHeight: 900200,
      blocksScanned: 100,
      txWithOpReturn: 150000,
      txAlkanes: 30000,
      alkanesOfOpReturnTx: 30000 / 150000,
    })
  })

  it("header sums totalTx and captures first/last dates", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { totalTx: 300000 }),
      row("2026-06-02", { totalTx: 310000 }),
    ])
    const p = await getPublicOpReturnData()
    expect(p.header).toEqual({ firstDate: "2026-06-01", lastDate: "2026-06-02", totalTxSampled: 610000 })
  })

  it("yields null on zero-denominator cases across series", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { totalTx: 0, txWithOpReturn: 0, txAlkanes: 0, feeTotalSats: 0, blocksScanned: 0 }),
    ])
    const p = await getPublicOpReturnData()
    expect(p.dailyShare[0].txShare).toBeNull()
    expect(p.dailyShare[0].opReturnPenetration).toBeNull()
    expect(p.opReturnShare[0].txPct).toBeNull()
    expect(p.dieselTxShare[0].value).toBeNull()
    expect(p.bytesPerTx[0].alkanes).toBeNull()
    expect(p.bytesPerTx[0].rest).toBeNull()
    expect(p.minerRevenueUsd[0].value).toBeNull()
    expect(p.feesSplitBtc[0].alkanes).toBeNull()
    expect(p.feesSplitBtc[0].rest).toBeNull()
    expect(p.alkanesFeeShare[0].value).toBeNull()
    expect(p.stats.latest?.alkanesOfOpReturnTx).toBeNull()
  })

  it("empty table: empty payload, never throws", async () => {
    store.listOpReturnDaily.mockResolvedValue([])
    const p = await getPublicOpReturnData()
    expect(p.days).toBe(0)
    expect(p.updatedAt).toBeNull()
    expect(p.latestDonut).toBeNull()
    expect(p.dailyShare).toEqual([])
    expect(p.opReturnShare).toEqual([])
    expect(p.dieselTxShare).toEqual([])
    expect(p.bytesComposition).toBeNull()
    expect(p.bytesPerTx).toEqual([])
    expect(p.minerRevenueUsd).toEqual([])
    expect(p.feesSplitBtc).toEqual([])
    expect(p.alkanesFeeShare).toEqual([])
    expect(p.fourAnswers).toEqual([])
    expect(p.dieselMintsPerDay).toEqual([])
    expect(p.dieselCumulative).toEqual([])
    expect(p.feePerTx).toEqual([])
    expect(p.ugMintsPerDay).toEqual([])
    expect(p.runesVsAlkanesShare).toEqual([])
    expect(p.runesVsAlkanesBytes).toEqual([])
    expect(p.byteComposition).toEqual([])
    expect(p.runestoneTxShare).toEqual([])
    expect(p.runestoneTxCount).toEqual([])
    expect(p.header).toEqual({ firstDate: null, lastDate: null, totalTxSampled: 0 })
    expect(p.stats.latest).toBeNull()
    expect(p.stats.last30.alkanesOfOpReturnTx).toBeNull()
    expect(p.stats.last30.opReturnFeeShare).toBeNull()
    expect(p.stats.full.alkanesFeeShare).toBeNull()
  })

  it("store throwing: same empty payload, never throws", async () => {
    store.listOpReturnDaily.mockRejectedValue(new Error("db down"))
    const p = await getPublicOpReturnData()
    expect(p.days).toBe(0)
    expect(p.header).toEqual({ firstDate: null, lastDate: null, totalTxSampled: 0 })
  })

  it("derives weightShare and ugDieselShare from weight/UG fields", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { weightTotal: 4_000_000, weightAlkanes: 800_000, ugMints: 1000, dieselUg: 900 }),
    ])
    const p = await getPublicOpReturnData()
    expect(p.weightShare[0].value).toBeCloseTo(800_000 / 4_000_000, 10)
    expect(p.ugDieselShare[0].value).toBeCloseTo(900 / 1000, 10)
  })

  it("weightShare/ugDieselShare are null when a field is null (row absent from payload optional fields)", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { weightTotal: null, weightAlkanes: null, ugMints: null, dieselUg: null }),
    ])
    const p = await getPublicOpReturnData()
    expect(p.weightShare[0].value).toBeNull()
    expect(p.ugDieselShare[0].value).toBeNull()
  })

  it("weightShare/ugDieselShare are null when only one side is null, or denominator is 0", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { weightTotal: 4_000_000, weightAlkanes: null, ugMints: 1000, dieselUg: null }),
      row("2026-06-02", { weightTotal: 0, weightAlkanes: 800_000, ugMints: 0, dieselUg: 900 }),
    ])
    const p = await getPublicOpReturnData()
    expect(p.weightShare[0].value).toBeNull()
    expect(p.ugDieselShare[0].value).toBeNull()
    expect(p.weightShare[1].value).toBeNull()
    expect(p.ugDieselShare[1].value).toBeNull()
  })

  it("stats.weight.full/latest are ratio-of-sums over rows with both fields non-null; latest = last such row", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { weightTotal: 4_000_000, weightAlkanes: 800_000 }),
      row("2026-06-02", { weightTotal: 5_000_000, weightAlkanes: 1_000_000 }),
      // last row has null weight data -> excluded from sums, and "latest" falls back to 06-02
      row("2026-06-03", { weightTotal: null, weightAlkanes: null }),
    ])
    const p = await getPublicOpReturnData()
    const expectedFull = (800_000 + 1_000_000) / (4_000_000 + 5_000_000)
    expect(p.stats.weight.full).toBeCloseTo(expectedFull, 10)
    expect(p.stats.weight.latest).toBeCloseTo(1_000_000 / 5_000_000, 10)
  })

  it("stats.weight is all-null when no row has both weight fields non-null", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { weightTotal: null, weightAlkanes: null })])
    const p = await getPublicOpReturnData()
    expect(p.stats.weight.full).toBeNull()
    expect(p.stats.weight.latest).toBeNull()
  })

  it("stats.ug early30 uses the FIRST 30 eligible rows and differs from last30 over 31+ rows", async () => {
    const rows: OpReturnRow[] = []
    for (let i = 1; i <= 35; i++) {
      const d = new Date(Date.UTC(2026, 0, 1))
      d.setUTCDate(d.getUTCDate() + (i - 1))
      const dateStr = d.toISOString().slice(0, 10)
      // first 30 rows: low UG-diesel ratio; last 5: high ratio
      const over = i <= 30 ? { ugMints: 1000, dieselUg: 100 } : { ugMints: 1000, dieselUg: 900 }
      rows.push(row(dateStr, over))
    }
    store.listOpReturnDaily.mockResolvedValue(rows)
    const p = await getPublicOpReturnData()

    expect(p.stats.ug.early30).toBeCloseTo((100 * 30) / (1000 * 30), 10)
    const last30 = rows.slice(-30)
    const sum = (arr: OpReturnRow[], f: (r: OpReturnRow) => number) => arr.reduce((s, r) => s + f(r), 0)
    expect(p.stats.ug.last30).toBeCloseTo(
      sum(last30, (r) => r.dieselUg ?? 0) / sum(last30, (r) => r.ugMints ?? 0), 10
    )
    expect(p.stats.ug.early30).not.toBeCloseTo(p.stats.ug.last30 as number, 10)
    expect(p.stats.ug.full).toBeCloseTo(
      sum(rows, (r) => r.dieselUg ?? 0) / sum(rows, (r) => r.ugMints ?? 0), 10
    )
  })

  it("stats.ug early30 only counts rows with both UG fields non-null, taking the first 30 such rows", async () => {
    const rows: OpReturnRow[] = []
    // rows 1-5 have null UG data (ineligible), rows 6-40 have UG data
    for (let i = 1; i <= 40; i++) {
      const d = `2026-03-${String(i).padStart(2, "0")}`
      const over = i <= 5 ? { ugMints: null, dieselUg: null } : { ugMints: 1000, dieselUg: i }
      rows.push(row(d, over))
    }
    store.listOpReturnDaily.mockResolvedValue(rows)
    const p = await getPublicOpReturnData()

    const eligible = rows.filter((r) => r.ugMints != null && r.dieselUg != null)
    const first30 = eligible.slice(0, 30)
    const sum = (arr: OpReturnRow[], f: (r: OpReturnRow) => number) => arr.reduce((s, r) => s + f(r), 0)
    expect(p.stats.ug.early30).toBeCloseTo(
      sum(first30, (r) => r.dieselUg ?? 0) / sum(first30, (r) => r.ugMints ?? 0), 10
    )
  })

  it("stats.ug is all-null when no row has both UG fields non-null", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { ugMints: null, dieselUg: null })])
    const p = await getPublicOpReturnData()
    expect(p.stats.ug.early30).toBeNull()
    expect(p.stats.ug.last30).toBeNull()
    expect(p.stats.ug.full).toBeNull()
  })

  it("empty table: weightShare/ugDieselShare empty, stats.weight/ug all null", async () => {
    store.listOpReturnDaily.mockResolvedValue([])
    const p = await getPublicOpReturnData()
    expect(p.weightShare).toEqual([])
    expect(p.ugDieselShare).toEqual([])
    expect(p.stats.weight).toEqual({ full: null, latest: null })
    expect(p.stats.ug).toEqual({ early30: null, last30: null, full: null })
  })

  it("derives fourAnswers: tx / OP_RETURN bytes / weight / fee shares aligned per row", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { weightTotal: 4_000_000, weightAlkanes: 800_000 }),
    ])
    const p = await getPublicOpReturnData()
    expect(p.fourAnswers[0].date).toBe("2026-06-01")
    expect(p.fourAnswers[0].byTx).toBeCloseTo(24000 / 300000, 10)
    expect(p.fourAnswers[0].byBytes).toBeCloseTo(500_000 / 1_500_000, 10)
    expect(p.fourAnswers[0].byWeight).toBeCloseTo(800_000 / 4_000_000, 10)
    expect(p.fourAnswers[0].byFee).toBeCloseTo(1_600_000 / 160_000_000, 10)
  })

  it("fourAnswers byWeight is null when weight fields are null; the other three still compute", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { weightTotal: null, weightAlkanes: null })])
    const p = await getPublicOpReturnData()
    expect(p.fourAnswers[0].byWeight).toBeNull()
    expect(p.fourAnswers[0].byTx).toBeCloseTo(24000 / 300000, 10)
    expect(p.fourAnswers[0].byBytes).toBeCloseTo(500_000 / 1_500_000, 10)
    expect(p.fourAnswers[0].byFee).toBeCloseTo(1_600_000 / 160_000_000, 10)
  })

  it("fourAnswers is null on zero denominators (tx / bytes / fee)", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { totalTx: 0, opReturnBytes: 0, feeTotalSats: 0 })])
    const p = await getPublicOpReturnData()
    expect(p.fourAnswers[0].byTx).toBeNull()
    expect(p.fourAnswers[0].byBytes).toBeNull()
    expect(p.fourAnswers[0].byFee).toBeNull()
  })

  it("dieselMintsPerDay extrapolates dieselMints to a full 144-block day (matches dashboard peak)", async () => {
    // blocksScanned 24 -> factor 6; dieselMints 91891 -> 551346 (the dashboard's stated peak)
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { blocksScanned: 24, dieselMints: 91891 })])
    const p = await getPublicOpReturnData()
    expect(p.dieselMintsPerDay[0].value).toBeCloseTo((91891 * 144) / 24, 6)
    expect(p.dieselMintsPerDay[0].value).toBeCloseTo(551346, 6)
  })

  it("dieselMintsPerDay is null when blocksScanned is 0", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { blocksScanned: 0 })])
    const p = await getPublicOpReturnData()
    expect(p.dieselMintsPerDay[0].value).toBeNull()
  })

  it("dieselCumulative is the running sum of extrapolated daily mints", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { blocksScanned: 144, dieselMints: 100 }), // factor 1 -> 100
      row("2026-06-02", { blocksScanned: 72, dieselMints: 100 }), //  factor 2 -> 200
    ])
    const p = await getPublicOpReturnData()
    expect(p.dieselCumulative[0].value).toBeCloseTo(100, 6)
    expect(p.dieselCumulative[1].value).toBeCloseTo(300, 6)
  })

  it("dieselCumulative carries forward across a zero-block day (adds 0, never null after it starts)", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { blocksScanned: 144, dieselMints: 100 }), // 100
      row("2026-06-02", { blocksScanned: 0, dieselMints: 0 }), //     perDay null -> +0
      row("2026-06-03", { blocksScanned: 144, dieselMints: 50 }), //  +50
    ])
    const p = await getPublicOpReturnData()
    expect(p.dieselCumulative[0].value).toBeCloseTo(100, 6)
    expect(p.dieselCumulative[1].value).toBeCloseTo(100, 6)
    expect(p.dieselCumulative[2].value).toBeCloseTo(150, 6)
  })

  it("derives feePerTx: alkanes and non-alkanes sats per transaction", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01")])
    const p = await getPublicOpReturnData()
    expect(p.feePerTx[0].alkanes).toBeCloseTo(1_600_000 / 24000, 10)
    expect(p.feePerTx[0].rest).toBeCloseTo((160_000_000 - 1_600_000) / (300000 - 24000), 10)
  })

  it("feePerTx alkanes is 0 (not null) when feeAlkanesSats is 0 but txAlkanes > 0", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { feeAlkanesSats: 0 })])
    const p = await getPublicOpReturnData()
    expect(p.feePerTx[0].alkanes).toBe(0)
  })

  it("feePerTx is null on zero denominators (no alkanes tx / no non-alkanes tx)", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { txAlkanes: 0 })])
    let p = await getPublicOpReturnData()
    expect(p.feePerTx[0].alkanes).toBeNull()
    // totalTx === txAlkanes -> non-alkanes denominator is 0 -> rest null
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { totalTx: 24000 })])
    p = await getPublicOpReturnData()
    expect(p.feePerTx[0].rest).toBeNull()
  })

  it("feePerTx alkanes is null below the 50-tx min sample (genesis-era outlier suppression)", async () => {
    // Real shape of 2025-01-20: 7 Alkanes tx averaging ~38,773 sats/tx — sampling noise that
    // dwarfed the whole "All time" y-axis. rest is unaffected (its denominator is the whole chain).
    store.listOpReturnDaily.mockResolvedValue([row("2025-01-20", { txAlkanes: 7, feeAlkanesSats: 271_411 })])
    let p = await getPublicOpReturnData()
    expect(p.feePerTx[0].alkanes).toBeNull()
    expect(p.feePerTx[0].rest).toBeCloseTo((160_000_000 - 271_411) / (300000 - 7), 10)
    // exactly at the threshold: shown
    store.listOpReturnDaily.mockResolvedValue([row("2025-02-15", { txAlkanes: 50, feeAlkanesSats: 25_000 })])
    p = await getPublicOpReturnData()
    expect(p.feePerTx[0].alkanes).toBeCloseTo(500, 10)
  })

  it("derives ugMintsPerDay: diesel = dieselUg, independent = ugMints - dieselUg (raw counts)", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { ugMints: 1000, dieselUg: 300 })])
    const p = await getPublicOpReturnData()
    expect(p.ugMintsPerDay[0].diesel).toBe(300)
    expect(p.ugMintsPerDay[0].independent).toBe(700)
  })

  it("ugMintsPerDay null when UG fields null; clamps independent to 0 when dieselUg > ugMints", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { ugMints: null, dieselUg: null }),
      row("2026-06-02", { ugMints: 100, dieselUg: 150 }),
    ])
    const p = await getPublicOpReturnData()
    expect(p.ugMintsPerDay[0].diesel).toBeNull()
    expect(p.ugMintsPerDay[0].independent).toBeNull()
    expect(p.ugMintsPerDay[1].independent).toBe(0)
  })

  it("derives runesVsAlkanesShare: alkanes and pure-runes shares of OP_RETURN bytes", async () => {
    // opReturnBytes 1.5M, runestoneBytes 1.3M, alkanesBytes 500k -> pure runes = 800k
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01")])
    const p = await getPublicOpReturnData()
    expect(p.runesVsAlkanesShare[0].alkanes).toBeCloseTo(500_000 / 1_500_000, 10)
    expect(p.runesVsAlkanesShare[0].pureRunes).toBeCloseTo((1_300_000 - 500_000) / 1_500_000, 10)
  })

  it("derives runesVsAlkanesBytes: alkanes/pure-runes absolute bytes extrapolated to a full day; null on 0 blocks", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { blocksScanned: 72 })]) // factor 2
    let p = await getPublicOpReturnData()
    expect(p.runesVsAlkanesBytes[0].alkanes).toBeCloseTo(500_000 * 2, 6)
    expect(p.runesVsAlkanesBytes[0].pureRunes).toBeCloseTo((1_300_000 - 500_000) * 2, 6)
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { blocksScanned: 0 })])
    p = await getPublicOpReturnData()
    expect(p.runesVsAlkanesBytes[0].alkanes).toBeNull()
    expect(p.runesVsAlkanesBytes[0].pureRunes).toBeNull()
  })

  it("derives byteComposition: alkanes / pure-runes / other shares summing to ~1; clamps negatives", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01")])
    let p = await getPublicOpReturnData()
    const c = p.byteComposition[0]
    expect(c.alkanes).toBeCloseTo(500_000 / 1_500_000, 10)
    expect(c.pureRunes).toBeCloseTo((1_300_000 - 500_000) / 1_500_000, 10)
    expect(c.other).toBeCloseTo((1_500_000 - 1_300_000) / 1_500_000, 10)
    expect((c.alkanes ?? 0) + (c.pureRunes ?? 0) + (c.other ?? 0)).toBeCloseTo(1, 10)
    // zero opReturnBytes -> all null; runestone>opReturn -> other clamps to 0
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { opReturnBytes: 0 }),
      row("2026-06-02", { opReturnBytes: 1_000_000, runestoneBytes: 1_200_000, alkanesBytes: 300_000 }),
    ])
    p = await getPublicOpReturnData()
    expect(p.byteComposition[0].alkanes).toBeNull()
    expect(p.byteComposition[1].other).toBe(0)
  })

  it("derives runestoneTxShare/runestoneTxCount from the already-extrapolated CSV columns (share cancels block count)", async () => {
    // Real 2026-07-05 shape: Alkanes 526476, pure Runes 1169 — the CSV values are full-day extrapolations.
    store.listOpReturnDaily.mockResolvedValue([row("2026-07-05", { txAlkRunestone: 526476, txPureRunes: 1169 })])
    const p = await getPublicOpReturnData()
    const total = 526476 + 1169
    expect(p.runestoneTxShare[0].alkanes).toBeCloseTo(526476 / total, 10)
    expect(p.runestoneTxShare[0].pureRunes).toBeCloseTo(1169 / total, 10)
    // the count series plot the stored values directly (no re-extrapolation)
    expect(p.runestoneTxCount[0].alkanes).toBe(526476)
    expect(p.runestoneTxCount[0].pureRunes).toBe(1169)
  })

  it("runestoneTx series are null when the columns are absent, a side is null, or the total is 0", async () => {
    // absent (default fixture has no txAlkRunestone/txPureRunes) -> all null
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01")])
    let p = await getPublicOpReturnData()
    expect(p.runestoneTxShare[0].alkanes).toBeNull()
    expect(p.runestoneTxShare[0].pureRunes).toBeNull()
    expect(p.runestoneTxCount[0].alkanes).toBeNull()
    expect(p.runestoneTxCount[0].pureRunes).toBeNull()
    // one side null -> share null; count reflects each side independently
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { txAlkRunestone: 100, txPureRunes: null })])
    p = await getPublicOpReturnData()
    expect(p.runestoneTxShare[0].alkanes).toBeNull()
    expect(p.runestoneTxCount[0].alkanes).toBe(100)
    expect(p.runestoneTxCount[0].pureRunes).toBeNull()
    // total 0 -> share null (avoid /0); count is a real 0 on both
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { txAlkRunestone: 0, txPureRunes: 0 })])
    p = await getPublicOpReturnData()
    expect(p.runestoneTxShare[0].alkanes).toBeNull()
    expect(p.runestoneTxCount[0].alkanes).toBe(0)
  })
})
