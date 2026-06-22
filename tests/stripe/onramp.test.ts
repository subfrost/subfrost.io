import { describe, it, expect } from "vitest"
import { computeOnrampMetrics } from "@/lib/stripe/onramp"
import type { OnrampSession } from "@/lib/stripe/shapes"

const base: Omit<OnrampSession, "id" | "status"> = {
  createdAt: "2026-06-20T00:00:00.000Z",
  sourceCurrency: "USD", sourceAmount: 100_00,
  destCurrency: "BTC", destAmount: 0.001, destNetwork: "bitcoin",
  walletAddress: "bc1qexample", transactionFee: 3_00, networkFee: 1_00, rejectionReason: null,
}
const s = (id: string, status: OnrampSession["status"], over: Partial<OnrampSession> = {}): OnrampSession =>
  ({ ...base, id, status, ...over })

describe("computeOnrampMetrics", () => {
  it("counts every status, sums fiat/fees/crypto over completed only, and rates conversion", () => {
    const sessions: OnrampSession[] = [
      s("a", "fulfillment_complete", { sourceAmount: 100_00, transactionFee: 3_00, networkFee: 1_00, destCurrency: "BTC", destAmount: 0.001 }),
      s("b", "fulfillment_complete", { sourceAmount: 200_00, transactionFee: 5_00, networkFee: 2_00, destCurrency: "ETH", destAmount: 0.05 }),
      s("c", "rejected", { rejectionReason: "blocked_country" }),
      s("d", "initialized"),
    ]
    const m = computeOnrampMetrics(sessions)
    expect(m.total).toBe(4)
    expect(m.completed).toBe(2)
    expect(m.byStatus.fulfillment_complete).toBe(2)
    expect(m.byStatus.rejected).toBe(1)
    expect(m.byStatus.initialized).toBe(1)
    expect(m.byStatus.expired).toBe(0) // every status present, even at 0
    expect(m.conversionRate).toBeCloseTo(0.5)
    expect(m.fiatVolume).toBe(300_00) // only completed
    expect(m.totalFees).toBe(11_00) // (3+1)+(5+2) dollars in cents
    expect(m.cryptoVolumeByAsset).toEqual({ BTC: 0.001, ETH: 0.05 })
  })

  it("returns all-zero metrics (conversionRate 0) for an empty input", () => {
    const m = computeOnrampMetrics([])
    expect(m.total).toBe(0)
    expect(m.completed).toBe(0)
    expect(m.conversionRate).toBe(0)
    expect(m.fiatVolume).toBe(0)
    expect(m.totalFees).toBe(0)
    expect(m.cryptoVolumeByAsset).toEqual({})
    expect(m.byStatus.fulfillment_complete).toBe(0)
  })
})

import { listOnrampSessions } from "@/lib/stripe/onramp"
import { seedSource } from "@/lib/stripe/source/seed"

describe("seed onrampSessions period filter", () => {
  it("'all' returns more rows than '7d', and '7d' rows are all recent", async () => {
    const all = await seedSource.onrampSessions("all")
    const week = await seedSource.onrampSessions("7d")
    expect(all.length).toBeGreaterThan(week.length)
    expect(week.length).toBeGreaterThan(0)
  })
})

describe("listOnrampSessions", () => {
  it("returns seed sessions + computed metrics + live=false in demo mode", async () => {
    delete process.env.STRIPE_SECRET_KEY // ensure demo source
    const { sessions, metrics, live } = await listOnrampSessions("all")
    expect(live).toBe(false)
    expect(sessions.length).toBeGreaterThan(0)
    expect(metrics.total).toBe(sessions.length)
    // metrics are internally consistent with the returned sessions
    expect(metrics.completed).toBe(sessions.filter((s) => s.status === "fulfillment_complete").length)
  })
})
