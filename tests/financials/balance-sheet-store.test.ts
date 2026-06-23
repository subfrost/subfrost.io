import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/redis", () => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }))
vi.mock("@/lib/prisma", () => {
  const invoice = { aggregate: vi.fn() }
  const instrument = { aggregate: vi.fn() }
  const shareClass = { findMany: vi.fn() }
  const shareHolding = { aggregate: vi.fn() }
  const balanceSheetItem = { findMany: vi.fn() }
  const client = { invoice, instrument, shareClass, shareHolding, balanceSheetItem }
  return { prisma: client, default: client }
})

import prisma from "@/lib/prisma"
import { cacheGet } from "@/lib/redis"
import { buildBalanceSheet } from "@/lib/financials/balance-sheet/store"

const inv = prisma.invoice as unknown as Record<string, ReturnType<typeof vi.fn>>
const inst = prisma.instrument as unknown as Record<string, ReturnType<typeof vi.fn>>
const cls = prisma.shareClass as unknown as Record<string, ReturnType<typeof vi.fn>>
const hold = prisma.shareHolding as unknown as Record<string, ReturnType<typeof vi.fn>>
const item = prisma.balanceSheetItem as unknown as Record<string, ReturnType<typeof vi.fn>>
const cg = cacheGet as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  cg.mockReset()
  ;[inv, inst, cls, hold, item].forEach((m) => Object.values(m).forEach((f) => f.mockReset()))
  inv.aggregate.mockResolvedValue({ _sum: { amountUsd: 0 }, _count: 0 })
  inst.aggregate.mockResolvedValue({ _sum: { amountUsd: 0 }, _count: 0 })
  cls.findMany.mockResolvedValue([])
  hold.aggregate.mockResolvedValue({ _sum: { shares: 0 } })
  item.findMany.mockResolvedValue([])
})

describe("buildBalanceSheet computed lines", () => {
  it("pulls a fresh treasury snapshot into the assets section", async () => {
    cg.mockResolvedValueOnce({ grandTotalUsd: 500000, fetchedAt: "2026-06-20T00:00:00Z" }) // fresh key hit
    const v = await buildBalanceSheet()
    expect(v.treasuryAvailable).toBe(true)
    expect(v.treasuryStale).toBe(false)
    const treasury = v.sections.ASSET.lines.find((l) => l.id === "computed:treasury")
    expect(treasury?.amountUsd).toBe(500000)
    expect(v.totalAssets).toBe(500000)
  })

  it("falls back to last-good treasury and marks it stale", async () => {
    cg.mockResolvedValueOnce(null) // fresh miss
    cg.mockResolvedValueOnce({ grandTotalUsd: 400000, fetchedAt: "2026-06-10T00:00:00Z" }) // last-good
    const v = await buildBalanceSheet()
    expect(v.treasuryStale).toBe(true)
    expect(v.sections.ASSET.lines.find((l) => l.id === "computed:treasury")?.amountUsd).toBe(400000)
  })

  it("derives AR (open invoices), SAFE liability, and common equity at par", async () => {
    cg.mockResolvedValue(null) // no treasury cached
    inv.aggregate.mockResolvedValueOnce({ _sum: { amountUsd: 12000 }, _count: 3 })
    inst.aggregate.mockResolvedValueOnce({ _sum: { amountUsd: 350000 }, _count: 2 })
    cls.findMany.mockResolvedValueOnce([{ id: "c1", parValue: 0.0001 }])
    hold.aggregate.mockResolvedValueOnce({ _sum: { shares: 10_000_000 } })

    const v = await buildBalanceSheet()
    expect(v.treasuryAvailable).toBe(false)
    expect(v.sections.ASSET.lines.find((l) => l.id === "computed:ar")?.amountUsd).toBe(12000)
    expect(v.sections.LIABILITY.lines.find((l) => l.id === "computed:safes")?.amountUsd).toBe(350000)
    // 10,000,000 × 0.0001 = 1000
    expect(v.sections.EQUITY.lines.find((l) => l.id === "computed:common")?.amountUsd).toBe(1000)
    expect(v.totalLiabilities).toBe(350000)
  })

  it("merges manual items and runs the balance check", async () => {
    cg.mockResolvedValue(null)
    item.findMany.mockResolvedValueOnce([
      { id: "m1", section: "ASSET", label: "Bank cash", amountUsd: 351000, sortOrder: 0, notes: null },
      { id: "m2", section: "LIABILITY", label: "AP", amountUsd: 1000, sortOrder: 0, notes: null },
      { id: "m3", section: "EQUITY", label: "Equity", amountUsd: 350000, sortOrder: 0, notes: null },
    ])
    const v = await buildBalanceSheet()
    expect(v.totalAssets).toBe(351000)
    expect(v.liabilitiesPlusEquity).toBe(351000)
    expect(v.balanced).toBe(true)
  })
})
