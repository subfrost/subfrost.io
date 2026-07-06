import { describe, it, expect, vi, beforeEach } from "vitest"

const prismaMock = vi.hoisted(() => ({
  wrapTransaction: { findMany: vi.fn() },
  unwrapTransaction: { findMany: vi.fn() },
  stripeWebhookEvent: { findMany: vi.fn() },
}))

vi.mock("@/lib/prisma", () => ({ default: prismaMock, prisma: prismaMock }))
vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/lib/financials/stripeRevenue", () => ({ getLiveStripeRevenue: vi.fn() }))
vi.mock("@/lib/financials/frbtc-indexer", () => ({
  getFrbtcVolumeRange: vi.fn(),
  getFrbtcVolumeTip: vi.fn(),
}))

import { revenueOverviewAction } from "@/actions/cms/revenue"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import { currentUser } from "@/lib/cms/authz"
import { getLiveStripeRevenue } from "@/lib/financials/stripeRevenue"
import { getFrbtcVolumeRange, getFrbtcVolumeTip } from "@/lib/financials/frbtc-indexer"
import { feeBtcFromSats } from "@/lib/financials/revenue"

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(currentUser).mockResolvedValue({ privileges: [FINANCIALS_PRIVILEGE] } as never)
  // Stripe: keep it out of the way — live path succeeds with an empty series.
  vi.mocked(getLiveStripeRevenue).mockResolvedValue({ events: [], subs: { activeCount: 0, mrr: 0 } } as never)
  prismaMock.wrapTransaction.findMany.mockResolvedValue([])
  prismaMock.unwrapTransaction.findMany.mockResolvedValue([])
  prismaMock.stripeWebhookEvent.findMany.mockResolvedValue([])
})

describe("revenueOverviewAction — BTC source selection", () => {
  it("rejects a caller without the financials privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue({ privileges: [] } as never)
    expect(await revenueOverviewAction()).toEqual({ ok: false, error: "unauthorized" })
    expect(getFrbtcVolumeRange).not.toHaveBeenCalled()
  })

  it("uses the on-chain indexer when it returns data (btcSource=indexer + tip)", async () => {
    vi.mocked(getFrbtcVolumeRange).mockResolvedValue({
      daily: [
        { date: "2026-06-01", wrapped_sats: 100_000, unwrapped_sats: 50_000, wrap_count: 2, unwrap_count: 1 },
        { date: "2026-06-02", wrapped_sats: 0, unwrapped_sats: 0, wrap_count: 0, unwrap_count: 0 },
      ],
      totals: { wrapped_sats: 100_000, unwrapped_sats: 50_000, volume_sats: 150_000, fee_revenue_sats: 450 },
    } as never)
    vi.mocked(getFrbtcVolumeTip).mockResolvedValue({ tip: 901_234 } as never)

    const r = await revenueOverviewAction()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.overview.btcSource).toBe("indexer")
    expect(r.overview.indexerTip).toBe(901_234)
    expect(r.overview.btcNote).toContain("901234")
    // The zero-volume day is dropped; the fee equals 0.3% of the day's volume.
    expect(r.overview.btcFee.daily).toEqual([
      { date: "2026-06-01", amount: feeBtcFromSats(150_000) },
    ])
    expect(r.overview.btcFee.rollups.all).toBe(feeBtcFromSats(150_000))
    // Indexer path must not touch the ledger tables.
    expect(prismaMock.wrapTransaction.findMany).not.toHaveBeenCalled()
    expect(prismaMock.unwrapTransaction.findMany).not.toHaveBeenCalled()
  })

  it("falls back to the ledger tables when the indexer is unconfigured (returns null)", async () => {
    vi.mocked(getFrbtcVolumeRange).mockResolvedValue(null)
    prismaMock.wrapTransaction.findMany.mockResolvedValue([
      { amount: "100000", timestamp: new Date("2026-06-01T12:00:00Z") },
    ])
    prismaMock.unwrapTransaction.findMany.mockResolvedValue([
      { amount: "50000", timestamp: new Date("2026-06-01T13:00:00Z") },
    ])

    const r = await revenueOverviewAction()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.overview.btcSource).toBe("tables")
    expect(r.overview.indexerTip).toBeNull()
    expect(r.overview.btcNote).toBe("from ledger tables")
    expect(r.overview.btcFee.rollups.all).toBe(feeBtcFromSats(150_000))
    expect(prismaMock.wrapTransaction.findMany).toHaveBeenCalled()
  })

  it("falls back to the ledger tables when the indexer throws", async () => {
    vi.mocked(getFrbtcVolumeRange).mockRejectedValue(new Error("indexer down"))
    prismaMock.wrapTransaction.findMany.mockResolvedValue([
      { amount: "200000", timestamp: new Date("2026-06-05T00:00:00Z") },
    ])

    const r = await revenueOverviewAction()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.overview.btcSource).toBe("tables")
    expect(r.overview.btcFee.rollups.all).toBe(feeBtcFromSats(200_000))
  })

  it("still reports the indexer source when the tip call fails (tip=null)", async () => {
    vi.mocked(getFrbtcVolumeRange).mockResolvedValue({
      daily: [{ date: "2026-06-01", wrapped_sats: 10_000, unwrapped_sats: 0, wrap_count: 1, unwrap_count: 0 }],
      totals: { wrapped_sats: 10_000, unwrapped_sats: 0, volume_sats: 10_000, fee_revenue_sats: 30 },
    } as never)
    vi.mocked(getFrbtcVolumeTip).mockRejectedValue(new Error("tip unavailable"))

    const r = await revenueOverviewAction()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.overview.btcSource).toBe("indexer")
    expect(r.overview.indexerTip).toBeNull()
    expect(r.overview.btcNote).toBe("on-chain indexer")
  })
})
