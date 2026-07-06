import { describe, it, expect, vi, afterEach } from "vitest"
import { fetchWalletBalances, fetchTreasurySnapshot } from "@/lib/financials/treasury/source/live"
import { normalizeBalances, round2, type TreasuryToken } from "@/lib/financials/treasury/shapes"

// A JSON-RPC batch stub: results are returned in request order. The provider
// sends [eth_getBalance, balanceOf(USDT), balanceOf(USDC), balanceOf(BUSD),
// balanceOf(WBNB)] per wallet. hex amounts below are 18-decimal wei.
function hex18(n: number): string {
  return "0x" + (BigInt(n) * 10n ** 18n).toString(16)
}

/** Mocks fetch: BSC RPC batch (array body) → balances; Binance ticker → BNB
 *  price; anything else → {}. */
function mockRpc(opts: { bnb?: number; usdt?: number; usdc?: number; busd?: number; wbnb?: number; bnbPrice?: number }) {
  const fn = vi.fn(async (url: string, init?: { body?: string }) => {
    if (typeof url === "string" && url.includes("binance.com")) {
      return { ok: true, status: 200, json: async () => ({ price: String(opts.bnbPrice ?? 600) }) }
    }
    // BSC RPC — respond to the batch in order.
    const results = [
      hex18(opts.bnb ?? 0),
      hex18(opts.usdt ?? 0),
      hex18(opts.usdc ?? 0),
      hex18(opts.busd ?? 0),
      hex18(opts.wbnb ?? 0),
    ]
    const batch = init?.body ? JSON.parse(init.body) : []
    const body = Array.isArray(batch)
      ? batch.map((r: { id: number }) => ({ jsonrpc: "2.0", id: r.id, result: results[r.id] }))
      : {}
    return { ok: true, status: 200, json: async () => body }
  })
  vi.stubGlobal("fetch", fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("normalizeBalances (pure)", () => {
  const tok = (over: Partial<TreasuryToken>): TreasuryToken => ({
    contract: "0x0", symbol: "T", name: "T", amount: 1, usd: 0, isNative: false, ...over,
  })

  it("drops zero balances, sorts by usd desc with nulls last, totals known usd", () => {
    const w = normalizeBalances(
      [
        tok({ symbol: "ZERO", amount: 0, usd: 999 }),
        tok({ symbol: "NOPRICE", amount: 5, usd: null }),
        tok({ symbol: "SMALL", amount: 2, usd: 10 }),
        tok({ symbol: "BIG", amount: 3, usd: 100 }),
      ],
      "0xABC",
      "Main",
    )
    expect(w.tokens.map((t) => t.symbol)).toEqual(["BIG", "SMALL", "NOPRICE"]) // ZERO dropped
    expect(w.tokens.at(-1)?.usd).toBeNull()
    expect(w.totalUsd).toBe(round2(110)) // nulls excluded
    expect(w.label).toBe("Main")
  })
})

describe("fetchWalletBalances (BSC JSON-RPC)", () => {
  it("reads native BNB + stablecoins and prices them", async () => {
    mockRpc({ bnb: 2, usdt: 1000, usdc: 500, busd: 0, wbnb: 0, bnbPrice: 600 })
    const w = await fetchWalletBalances("0xABC", "Main")
    const bySym = Object.fromEntries(w.tokens.map((t) => [t.symbol, t]))
    expect(bySym.USDT.amount).toBe(1000)
    expect(bySym.USDT.usd).toBe(1000) // stable 1:1
    expect(bySym.USDC.usd).toBe(500)
    expect(bySym.BNB.isNative).toBe(true)
    expect(bySym.BNB.usd).toBe(1200) // 2 × 600
    expect(bySym.BUSD).toBeUndefined() // zero balance dropped
    expect(w.totalUsd).toBe(round2(1000 + 500 + 1200))
    expect(w.label).toBe("Main")
  })

  it("throws when the RPC returns non-OK (caller degrades to last-good)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        typeof url === "string" && url.includes("binance.com")
          ? { ok: true, status: 200, json: async () => ({ price: "600" }) }
          : { ok: false, status: 502, json: async () => ({}) },
      ),
    )
    await expect(fetchWalletBalances("0xABC")).rejects.toThrow(/BSC RPC 502/)
  })
})

describe("fetchTreasurySnapshot", () => {
  it("fans out over both treasury wallets and sums the grand total", async () => {
    mockRpc({ usdt: 100, bnbPrice: 600 }) // each wallet: 100 USDT ⇒ $100
    const snap = await fetchTreasurySnapshot()
    expect(snap.wallets).toHaveLength(2) // TREASURY_WALLETS has 2 addresses
    expect(snap.grandTotalUsd).toBe(round2(200))
    expect(typeof snap.fetchedAt).toBe("string")
  })
})
