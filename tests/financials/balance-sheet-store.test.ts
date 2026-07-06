import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/redis", () => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }))
vi.mock("@/lib/prisma", () => {
  const invoice = { aggregate: vi.fn() }
  const instrument = { aggregate: vi.fn() }
  const shareClass = { findMany: vi.fn() }
  const shareHolding = { aggregate: vi.fn() }
  const balanceSheetItem = { findMany: vi.fn() }
  const fuelAllocation = { aggregate: vi.fn() }
  const client = { invoice, instrument, shareClass, shareHolding, balanceSheetItem, fuelAllocation }
  return { prisma: client, default: client }
})

import prisma from "@/lib/prisma"
import { cacheGet } from "@/lib/redis"
import { buildBalanceSheet } from "@/lib/financials/balance-sheet/store"
import { FUEL_PRESALE_PROCEEDS_USD } from "@/lib/fuel/supply"

const inv = prisma.invoice as unknown as Record<string, ReturnType<typeof vi.fn>>
const inst = prisma.instrument as unknown as Record<string, ReturnType<typeof vi.fn>>
const cls = prisma.shareClass as unknown as Record<string, ReturnType<typeof vi.fn>>
const hold = prisma.shareHolding as unknown as Record<string, ReturnType<typeof vi.fn>>
const item = prisma.balanceSheetItem as unknown as Record<string, ReturnType<typeof vi.fn>>
const fuel = prisma.fuelAllocation as unknown as Record<string, ReturnType<typeof vi.fn>>
const cg = cacheGet as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  cg.mockReset()
  ;[inv, inst, cls, hold, item, fuel].forEach((m) => Object.values(m).forEach((f) => f.mockReset()))
  inv.aggregate.mockResolvedValue({ _sum: { amountUsd: 0 }, _count: 0 })
  inst.aggregate.mockResolvedValue({ _sum: { amountUsd: 0 }, _count: 0 })
  cls.findMany.mockResolvedValue([])
  hold.aggregate.mockResolvedValue({ _sum: { shares: 0 } })
  item.findMany.mockResolvedValue([])
  fuel.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
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

  it("derives AR (open invoices), SAFE equity preference, and common equity at par", async () => {
    cg.mockResolvedValue(null) // no treasury cached
    inv.aggregate.mockResolvedValueOnce({ _sum: { amountUsd: 12000 }, _count: 3 })
    inst.aggregate.mockResolvedValueOnce({ _sum: { amountUsd: 350000 }, _count: 2 })
    cls.findMany.mockResolvedValueOnce([{ id: "c1", parValue: 0.0001 }])
    hold.aggregate.mockResolvedValueOnce({ _sum: { shares: 10_000_000 } })

    const v = await buildBalanceSheet()
    expect(v.treasuryAvailable).toBe(false)
    expect(v.sections.ASSET.lines.find((l) => l.id === "computed:ar")?.amountUsd).toBe(12000)
    // SAFEs are now a senior-to-common EQUITY preference, NOT a liability.
    expect(v.sections.LIABILITY.lines.find((l) => l.id === "computed:safes")).toBeUndefined()
    expect(v.sections.EQUITY.lines.find((l) => l.id === "computed:safes")?.amountUsd).toBe(350000)
    expect(v.safePreferenceUsd).toBe(350000)
    // 10,000,000 × 0.0001 = 1000
    expect(v.sections.EQUITY.lines.find((l) => l.id === "computed:common")?.amountUsd).toBe(1000)
    // Only the deferred-FUEL obligation is a liability (=$0 default here).
    expect(v.totalLiabilities).toBe(FUEL_PRESALE_PROCEEDS_USD)
    expect(v.sections.LIABILITY.lines.find((l) => l.id === "computed:deferred-fuel")?.amountUsd).toBe(FUEL_PRESALE_PROCEEDS_USD)
  })

  it("books the deferred-FUEL obligation as a liability at proceeds received (not marked to price)", async () => {
    cg.mockResolvedValue(null)
    const v = await buildBalanceSheet()
    const line = v.sections.LIABILITY.lines.find((l) => l.id === "computed:deferred-fuel")
    expect(line).toBeDefined()
    expect(line?.amountUsd).toBe(FUEL_PRESALE_PROCEEDS_USD) // sized as consideration received
  })

  it("exposes the FUEL overhang as a memo excluded from all totals and the balance check", async () => {
    cg.mockResolvedValue(null)
    fuel.aggregate.mockResolvedValueOnce({ _sum: { amount: 100_000 } })
    const v = await buildBalanceSheet()
    const overhang = v.memo.find((l) => l.id === "memo:fuel-overhang")
    expect(overhang).toBeDefined()
    // (2,100,000 − 100,000) × 17.17 = 34,340,000
    expect(overhang?.amountUsd).toBe(34_340_000)
    // Not summed into any section total, and the sheet still balances (0 = 0).
    expect(v.totalAssets).toBe(0)
    expect(v.totalLiabilities).toBe(0)
    expect(v.totalEquity).toBe(0)
    expect(v.balanced).toBe(true)
  })

  it("computes equity attributable to common (409A) = assets − liabilities − SAFE preference", async () => {
    cg.mockResolvedValueOnce({ grandTotalUsd: 1_000_000, fetchedAt: "2026-06-20T00:00:00Z" })
    inst.aggregate.mockResolvedValueOnce({ _sum: { amountUsd: 350000 }, _count: 2 })
    const v = await buildBalanceSheet()
    // assets 1,000,000 − liabilities 0 − SAFE preference 350,000 = 650,000
    expect(v.safePreferenceUsd).toBe(350000)
    expect(v.attributableToCommonUsd).toBe(650000)
    expect(v.attributableToCommonUsd).toBeGreaterThan(0)
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
