import { it, expect } from "vitest"
import { parseHistoryCsv } from "@/lib/marketing/opreturn-sync"

const CSV = `date,fromHeight,toHeight,blocksScanned,totalTx,txWithOpReturn,txAlkanes,opReturnBytes,runestoneBytes,alkanesBytes,dieselMints,feeTotalSats,feeAlkanesSats,feeOpReturnSats,btcUsd
2025-12-29,930000,930090,11,38847,19132,1862,186773,164044,41320,1859,20479751,172670,1565961,87822.9
2026-06-28,955647,955790,24,125074,95833,94418,2038109,1992077,1985791,94277,34686939,9256009,9907915,60236.9`

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
