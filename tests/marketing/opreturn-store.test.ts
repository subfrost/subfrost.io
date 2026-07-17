import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
  default: { opReturnDaily: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() } },
}))

import { dropOpenDay } from "@/lib/marketing/opreturn-store"
import type { OpReturnRow } from "@/lib/marketing/opreturn-types"

function row(date: string, over: Partial<OpReturnRow> = {}): OpReturnRow {
  return {
    date, fromHeight: 900000, toHeight: 900100, blocksScanned: 100,
    totalTx: 1, txWithOpReturn: 1, txAlkanes: 1,
    opReturnBytes: 1, runestoneBytes: 1, alkanesBytes: 1, dieselMints: 1,
    feeTotalSats: 1, feeAlkanesSats: 1, feeOpReturnSats: 1, btcUsd: 1,
    ...over,
  }
}

// dropOpenDay is the filter behind listClosedOpReturnDays -- see its doc comment in
// lib/marketing/opreturn-store.ts for why this is a DATE filter, not "drop the newest row".
describe("dropOpenDay", () => {
  it("removes the row dated today-UTC, keeps closed rows", () => {
    const rows = [row("2026-07-15"), row("2026-07-16"), row("2026-07-17")]
    expect(dropOpenDay(rows, "2026-07-17").map((r) => r.date)).toEqual(["2026-07-15", "2026-07-16"])
  })

  it("is a no-op when no row carries today's date (the post-scanner-fix regime)", () => {
    const rows = [row("2026-07-15"), row("2026-07-16")]
    expect(dropOpenDay(rows, "2026-07-17")).toEqual(rows)
  })

  it("returns [] safely for []", () => {
    expect(dropOpenDay([], "2026-07-17")).toEqual([])
  })
})
