import { describe, it, expect, vi, beforeEach } from "vitest"

const list = vi.fn()
vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: () => ({ crypto: { onrampSessions: { list } } }),
}))

import { liveOnrampSessions } from "@/lib/stripe/source/live/onramp"

beforeEach(() => list.mockReset())

describe("liveOnrampSessions mapping", () => {
  it("normalizes a raw session (fiat cents, crypto decimal, ISO date)", async () => {
    list.mockResolvedValue({
      data: [{
        id: "cos_live_1", status: "fulfillment_complete", created: 1_750_000_000,
        transaction_details: {
          source_currency: "usd", source_amount: 100_00,
          destination_currency: "btc", destination_amount: "0.0012", destination_network: "bitcoin",
          wallet_address: "bc1qlive", fees: { transaction_fee: 3_00, network_fee: 1_00 },
        },
      }],
    })
    const [s] = await liveOnrampSessions("30d")
    expect(s).toMatchObject({
      id: "cos_live_1", status: "fulfillment_complete",
      sourceCurrency: "USD", sourceAmount: 100_00,
      destCurrency: "BTC", destAmount: 0.0012, destNetwork: "bitcoin",
      walletAddress: "bc1qlive", transactionFee: 3_00, networkFee: 1_00, rejectionReason: null,
    })
    expect(s.createdAt).toBe(new Date(1_750_000_000 * 1000).toISOString())
  })

  it("captures rejection reason and a null destAmount before fulfillment", async () => {
    list.mockResolvedValue({
      data: [{
        id: "cos_live_2", status: "rejected", created: 1_750_000_000,
        transaction_details: { source_currency: "usd", source_amount: 50_00, destination_currency: "eth", destination_network: "ethereum", wallet_address: "0xabc", rejection_reason: "blocked" },
      }],
    })
    const [s] = await liveOnrampSessions("30d")
    expect(s.rejectionReason).toBe("blocked")
    expect(s.destAmount).toBeNull()
  })

  it("maps an unknown status to 'initialized'", async () => {
    list.mockResolvedValue({ data: [{ id: "x", status: "some_new_status", created: 1, transaction_details: {} }] })
    const [s] = await liveOnrampSessions("all")
    expect(s.status).toBe("initialized")
  })
})

describe("liveSource.onrampSessions degrade", () => {
  it("returns [] when the live read throws (product not enabled)", async () => {
    list.mockRejectedValueOnce(new Error("onramp not enabled"))
    const { liveSource } = await import("@/lib/stripe/source/live")
    expect(await liveSource.onrampSessions("30d")).toEqual([])
  })
})
