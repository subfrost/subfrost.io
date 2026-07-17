import { it, expect } from "vitest"
import { parseHistoryCsv } from "@/lib/marketing/opreturn-sync"

const CSV = `date,fromHeight,toHeight,blocksScanned,totalTx,txWithOpReturn,txAlkanes,opReturnBytes,runestoneBytes,alkanesBytes,dieselMints,feeTotalSats,feeAlkanesSats,feeOpReturnSats,btcUsd
2025-12-29,930000,930090,11,38847,19132,1862,186773,164044,41320,1859,20479751,172670,1565961,87822.9
2026-06-28,955647,955790,24,125074,95833,94418,2038109,1992077,1985791,94277,34686939,9256009,9907915,60236.9`

const CSV19 = `date,fromHeight,toHeight,blocksScanned,totalTx,txWithOpReturn,txAlkanes,opReturnBytes,runestoneBytes,alkanesBytes,dieselMints,feeTotalSats,feeAlkanesSats,feeOpReturnSats,btcUsd,weightTotal,weightAlkanes,ugMints,dieselUg
2025-12-29,930000,930090,11,38847,19132,1862,186773,164044,41320,1859,20479751,172670,1565961,87822.90829076794,327363183,18285100,141211,23514
2026-06-28,955647,955790,24,125074,95833,94418,2038109,1992077,1985791,94277,34686939,9256009,9907915,60236.9,340000000,20000000,150000,25000`

it("parses each data row into a typed OpReturnRow", () => {
  const rows = parseHistoryCsv(CSV)
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({ date: "2025-12-29", totalTx: 38847, txAlkanes: 1862, btcUsd: 87822.9 })
  expect(rows[1].alkanesBytes).toBe(1985791)
  expect(typeof rows[1].feeAlkanesSats).toBe("number")
})

it("skips blank and malformed lines", () => {
  const rows = parseHistoryCsv(CSV + "\n\nbad,row,short\n")
  expect(rows).toHaveLength(2)
})

it("skips rows with a non-numeric cell", () => {
  const bad = "2026-01-02,930000,930090,11,NaN,19132,1862,186773,164044,41320,1859,20479751,172670,1565961,87822.9"
  const rows = parseHistoryCsv(CSV + "\n" + bad)
  expect(rows).toHaveLength(2) // the NaN row is dropped; only the 2 valid CSV rows remain
})

it("legacy 15-column CSV: optional fields are null", () => {
  const rows = parseHistoryCsv(CSV)
  expect(rows).toHaveLength(2)
  for (const r of rows) {
    expect(r.weightTotal).toBeNull()
    expect(r.weightAlkanes).toBeNull()
    expect(r.ugMints).toBeNull()
    expect(r.dieselUg).toBeNull()
  }
})

it("19-column CSV: parses optional fields as numbers", () => {
  const rows = parseHistoryCsv(CSV19)
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({
    date: "2025-12-29",
    btcUsd: 87822.90829076794,
    weightTotal: 327363183,
    weightAlkanes: 18285100,
    ugMints: 141211,
    dieselUg: 23514,
  })
  expect(rows[1]).toMatchObject({
    weightTotal: 340000000,
    weightAlkanes: 20000000,
    ugMints: 150000,
    dieselUg: 25000,
  })
})

it("trailing empty optional cells (today's partial row) become null while base fields stay intact", () => {
  const header = CSV19.split("\n")[0]
  const partial = "2026-07-03,956000,956010,10,1000,500,400,10000,8000,2000,300,100000,50000,20000,65000,,,,"
  const rows = parseHistoryCsv(header + "\n" + partial)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ date: "2026-07-03", totalTx: 1000, txAlkanes: 400, btcUsd: 65000 })
  expect(rows[0].weightTotal).toBeNull()
  expect(rows[0].weightAlkanes).toBeNull()
  expect(rows[0].ugMints).toBeNull()
  expect(rows[0].dieselUg).toBeNull()
})

it("header missing a base column: refuses everything", () => {
  const badHeader = "date,fromHeight,toHeight,blocksScanned,totalTx,txWithOpReturn,txAlkanes,opReturnBytes,runestoneBytes,alkanesBytes,dieselMints,feeTotalSats,feeAlkanesSats,feeOpReturnSats"
  // btcUsd missing from header
  const line = "2025-12-29,930000,930090,11,38847,19132,1862,186773,164044,41320,1859,20479751,172670,1565961"
  const rows = parseHistoryCsv(badHeader + "\n" + line)
  expect(rows).toEqual([])
})

it("garbage in an optional cell: null while the row survives", () => {
  const header = CSV19.split("\n")[0]
  const line = "2026-01-05,930000,930090,11,38847,19132,1862,186773,164044,41320,1859,20479751,172670,1565961,87822.9,garbage,18285100,141211,23514"
  const rows = parseHistoryCsv(header + "\n" + line)
  expect(rows).toHaveLength(1)
  expect(rows[0].weightTotal).toBeNull()
  expect(rows[0].weightAlkanes).toBe(18285100)
  expect(rows[0].ugMints).toBe(141211)
  expect(rows[0].dieselUg).toBe(23514)
})

it("garbage in a base cell: row skipped even with valid optional cells", () => {
  const header = CSV19.split("\n")[0]
  const line = "2026-01-06,930000,930090,11,NaN,19132,1862,186773,164044,41320,1859,20479751,172670,1565961,87822.9,327363183,18285100,141211,23514"
  const rows = parseHistoryCsv(header + "\n" + line)
  expect(rows).toEqual([])
})

it("column order in the header does not matter (header-based mapping)", () => {
  const reordered = `btcUsd,date,fromHeight,toHeight,blocksScanned,totalTx,txWithOpReturn,txAlkanes,opReturnBytes,runestoneBytes,alkanesBytes,dieselMints,feeTotalSats,feeAlkanesSats,feeOpReturnSats,dieselUg,weightTotal,weightAlkanes,ugMints
87822.9,2025-12-29,930000,930090,11,38847,19132,1862,186773,164044,41320,1859,20479751,172670,1565961,23514,327363183,18285100,141211`
  const rows = parseHistoryCsv(reordered)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    date: "2025-12-29",
    btcUsd: 87822.9,
    weightTotal: 327363183,
    weightAlkanes: 18285100,
    ugMints: 141211,
    dieselUg: 23514,
  })
})
