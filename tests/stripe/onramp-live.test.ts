import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// liveOnrampSessions hits /v1/crypto/onramp_sessions over REST (stripe-node v22
// has no crypto namespace), so the seam is global fetch, not the SDK client.
const fetchMock = vi.fn()

import { liveOnrampSessions } from "@/lib/stripe/source/live/onramp"

const KEY = "sk_test_onramp"

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  process.env.STRIPE_SECRET_KEY = KEY
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.STRIPE_SECRET_KEY
})

describe("liveOnrampSessions mapping", () => {
  it("normalizes a raw session (dollar-decimal fiat to cents, crypto decimal, ISO date)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      data: [{
        id: "cos_live_1", status: "fulfillment_complete", created: 1_750_000_000,
        transaction_details: {
          source_currency: "usd", source_amount: "100.00",
          destination_currency: "btc", destination_amount: "0.0012", destination_network: "bitcoin",
          wallet_address: "bc1qlive", fees: { transaction_fee: "3.00", network_fee: "1.00" },
        },
      }],
    }))
    const [s] = await liveOnrampSessions("30d")
    expect(s).toMatchObject({
      id: "cos_live_1", status: "fulfillment_complete",
      sourceCurrency: "USD", sourceAmount: 100_00,
      destCurrency: "BTC", destAmount: 0.0012, destNetwork: "bitcoin",
      walletAddress: "bc1qlive", transactionFee: 3_00, networkFee: 1_00, rejectionReason: null,
    })
    expect(s.createdAt).toBe(new Date(1_750_000_000 * 1000).toISOString())
  })

  it("requests the crypto endpoint with the preview version and a created[gte] window", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }))
    await liveOnrampSessions("30d")
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("https://api.stripe.com/v1/crypto/onramp_sessions")
    expect(String(url)).toContain("created%5Bgte%5D=")
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`)
    expect(init.headers["Stripe-Version"]).toContain("crypto_onramp_beta=v2")
  })

  it("omits the created window for period 'all'", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }))
    await liveOnrampSessions("all")
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("created")
  })

  it("captures rejection reason and a null destAmount before fulfillment", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      data: [{
        id: "cos_live_2", status: "rejected", created: 1_750_000_000,
        transaction_details: { source_currency: "usd", source_amount: "50.00", destination_currency: "eth", destination_network: "ethereum", wallet_address: "0xabc", rejection_reason: "blocked" },
      }],
    }))
    const [s] = await liveOnrampSessions("30d")
    expect(s.rejectionReason).toBe("blocked")
    expect(s.destAmount).toBeNull()
  })

  it("maps an unknown status to 'initialized'", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: "x", status: "some_new_status", created: 1, transaction_details: {} }] }))
    const [s] = await liveOnrampSessions("all")
    expect(s.status).toBe("initialized")
  })

  it("returns [] without calling the API when no secret key is configured", async () => {
    delete process.env.STRIPE_SECRET_KEY
    expect(await liveOnrampSessions("30d")).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("liveSource.onrampSessions degrade", () => {
  it("returns [] when the live read throws (product not enabled)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) })
    const { liveSource } = await import("@/lib/stripe/source/live")
    expect(await liveSource.onrampSessions("30d")).toEqual([])
  })
})
