import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

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
  getFrbtcTotalSupplySats: vi.fn(() => Promise.resolve(null)),
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
  // currentBtcUsd() does a real fetch to the subpricer — stub it non-OK so the
  // fee series stays BTC-denominated and the assertions below are deterministic.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })))
})

afterEach(() => vi.unstubAllGlobals())

describe("revenueOverviewAction — BTC source selection", () => {
  it("rejects a caller without the financials privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue({ privileges: [] } as never)
    expect(await revenueOverviewAction()).toEqual({ ok: false, error: "unauthorized" })
    expect(getFrbtcVolumeRange).not.toHaveBeenCalled()
  })

  it("uses the on-chain indexer when it returns data (btcSource=indexer + tip)", async () => {
    // Alkanes venue returns data; BRC20-Prog venue is unwired (null) so the
    // headline reflects alkanes alone here (the cumulative case is its own test).
    vi.mocked(getFrbtcVolumeRange).mockImplementation(((_f: string, _t: string, source?: string) =>
      Promise.resolve(
        source === "brc20"
          ? null
          : {
              daily: [
                { date: "2026-06-01", wrapped_sats: 100_000, unwrapped_sats: 50_000, wrap_count: 2, unwrap_count: 1 },
                { date: "2026-06-02", wrapped_sats: 0, unwrapped_sats: 0, wrap_count: 0, unwrap_count: 0 },
              ],
              totals: { wrapped_sats: 100_000, unwrapped_sats: 50_000, volume_sats: 150_000, fee_revenue_sats: 450 },
            },
      )) as never)
    vi.mocked(getFrbtcVolumeTip).mockResolvedValue({ tip: 901_234 } as never)

    const r = await revenueOverviewAction()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.overview.btcSource).toBe("indexer")
    expect(r.overview.indexerTip).toBe(901_234)
    expect(r.overview.btcNote).toContain("901234")
    // The zero-volume day is dropped; the fee = 0.1% of the day's volume plus
    // the 546-sat anchor retained per unwrap (unwrap_count = 1).
    const dayFee = feeBtcFromSats(150_000) + (546 * 1) / 100_000_000
    expect(r.overview.btcFee.daily).toEqual([{ date: "2026-06-01", amount: dayFee }])
    expect(r.overview.btcFee.rollups.all).toBe(dayFee)
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
    // Alkanes only (BRC20-Prog unwired) so btcNote has no venue suffix.
    vi.mocked(getFrbtcVolumeRange).mockImplementation(((_f: string, _t: string, source?: string) =>
      Promise.resolve(
        source === "brc20"
          ? null
          : {
              daily: [{ date: "2026-06-01", wrapped_sats: 10_000, unwrapped_sats: 0, wrap_count: 1, unwrap_count: 0 }],
              totals: { wrapped_sats: 10_000, unwrapped_sats: 0, volume_sats: 10_000, fee_revenue_sats: 30 },
            },
      )) as never)
    vi.mocked(getFrbtcVolumeTip).mockRejectedValue(new Error("tip unavailable"))

    const r = await revenueOverviewAction()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.overview.btcSource).toBe("indexer")
    expect(r.overview.indexerTip).toBeNull()
    expect(r.overview.btcNote).toBe("on-chain indexer")
  })

  it("headline BTC fee is cumulative across venues; per-venue series split out", async () => {
    // Both venues return data (alkanes 150k volume/1 unwrap, BRC20-Prog 90k
    // volume/0 unwrap). Headline btcFee = alkanes + brc20; the split series carry
    // each alone, and btcNote flags the BRC20-Prog venue.
    vi.mocked(getFrbtcVolumeRange).mockImplementation(((_f: string, _t: string, source?: string) =>
      Promise.resolve(
        source === "brc20"
          ? {
              daily: [{ date: "2026-06-01", wrapped_sats: 60_000, unwrapped_sats: 30_000, wrap_count: 1, unwrap_count: 0 }],
              totals: { wrapped_sats: 60_000, unwrapped_sats: 30_000, volume_sats: 90_000, fee_revenue_sats: 90 },
            }
          : {
              daily: [{ date: "2026-06-01", wrapped_sats: 100_000, unwrapped_sats: 50_000, wrap_count: 2, unwrap_count: 1 }],
              totals: { wrapped_sats: 100_000, unwrapped_sats: 50_000, volume_sats: 150_000, fee_revenue_sats: 450 },
            },
      )) as never)
    vi.mocked(getFrbtcVolumeTip).mockImplementation(((source?: string) =>
      Promise.resolve({ tip: source === "brc20" ? 928_500 : 901_234 })) as never)

    const r = await revenueOverviewAction()
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const alkanesFee = feeBtcFromSats(150_000) + (546 * 1) / 100_000_000 // + anchor
    const brc20Fee = feeBtcFromSats(90_000)
    expect(r.overview.btcFeeAlkanes.rollups.all).toBeCloseTo(alkanesFee, 12)
    expect(r.overview.btcFeeBrc20.rollups.all).toBeCloseTo(brc20Fee, 12)
    expect(r.overview.btcFee.rollups.all).toBeCloseTo(alkanesFee + brc20Fee, 12)
    expect(r.overview.brc20Source).toBe("indexer")
    expect(r.overview.brc20IndexerTip).toBe(928_500)
    expect(r.overview.btcNote).toContain("BRC20-Prog")
  })
})
