import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { fetchWalletBalances } from "@/lib/financials/treasury/source/live"

function mockFetch(json: unknown, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({ ok, status, json: async () => json })
  vi.stubGlobal("fetch", fn)
  return fn
}

beforeEach(() => {
  process.env.GOLDRUSH_API_KEY = "test-goldrush-key"
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const sample = {
  data: {
    items: [
      { contract_address: "0xnative", contract_ticker_symbol: "BNB", contract_name: "BNB",
        contract_decimals: 18, balance: "1000000000000000000", quote: 600, native_token: true, is_spam: false },
    ],
  },
  error: false,
}

describe("fetchWalletBalances", () => {
  it("calls the BSC balances_v2 endpoint with the Bearer key and normalizes", async () => {
    const fn = mockFetch(sample)
    const w = await fetchWalletBalances("0xABC", "Main")
    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain("/bsc-mainnet/address/0xABC/balances_v2/")
    expect(url).toContain("quote-currency=USD")
    expect(opts.headers.Authorization).toBe("Bearer test-goldrush-key")
    expect(w.label).toBe("Main")
    expect(w.tokens[0].symbol).toBe("BNB")
    expect(w.totalUsd).toBe(600)
  })

  it("throws when the key is missing", async () => {
    delete process.env.GOLDRUSH_API_KEY
    await expect(fetchWalletBalances("0xABC")).rejects.toThrow(/GOLDRUSH_API_KEY/)
  })

  it("throws on a non-OK response", async () => {
    mockFetch({ error: true }, false, 429)
    await expect(fetchWalletBalances("0xABC")).rejects.toThrow(/GoldRush 429/)
  })
})
