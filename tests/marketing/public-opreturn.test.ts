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

  it("computes bytesComposition as all-time fractions across all rows", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01"),
      row("2026-06-02", { opReturnBytes: 2_000_000, alkanesBytes: 600_000, runestoneBytes: 1_400_000 }),
    ])
    const p = await getPublicOpReturnData()
    const totalBytes = 1_500_000 + 2_000_000
    const totalAlkanes = 500_000 + 600_000
    const totalRunes = 1_300_000 + 1_400_000
    const expectedAlkanes = totalAlkanes / totalBytes
    const expectedRunes = totalRunes / totalBytes
    expect(p.bytesComposition).not.toBeNull()
    expect(p.bytesComposition!.alkanes).toBeCloseTo(expectedAlkanes, 10)
    expect(p.bytesComposition!.runes).toBeCloseTo(expectedRunes, 10)
    expect(p.bytesComposition!.other).toBeCloseTo(Math.max(0, 1 - expectedAlkanes - expectedRunes), 10)
  })

  it("bytesComposition is null when total opReturnBytes across all rows is 0", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { opReturnBytes: 0, alkanesBytes: 0, runestoneBytes: 0 }),
    ])
    const p = await getPublicOpReturnData()
    expect(p.bytesComposition).toBeNull()
  })

  it("bytesComposition clamps other to 0 (not negative) when alkanes+runes bytes exceed opReturnBytes", async () => {
    store.listOpReturnDaily.mockResolvedValue([
      row("2026-06-01", { opReturnBytes: 1_000_000, alkanesBytes: 700_000, runestoneBytes: 500_000 }),
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
          ? { opReturnBytes: 1000, alkanesBytes: 1000, runestoneBytes: 0 }
          : { opReturnBytes: 1000, alkanesBytes: 0, runestoneBytes: 1000 }
      rows.push(row(dateStr, over))
    }
    store.listOpReturnDaily.mockResolvedValue(rows)
    const p = await getPublicOpReturnData()
    // If this only used the last-60d window, alkanes fraction would be 0 (all-runes there).
    // Using all 90 rows, the first 30 pure-alkanes rows must still contribute.
    expect(p.bytesComposition).not.toBeNull()
    expect(p.bytesComposition!.alkanes).toBeCloseTo(30 / 90, 10)
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
    expect(p.header).toEqual({ firstDate: null, lastDate: null, totalTxSampled: 0 })
    expect(p.stats.latest).toBeNull()
    expect(p.stats.last30.alkanesOfOpReturnTx).toBeNull()
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
})
