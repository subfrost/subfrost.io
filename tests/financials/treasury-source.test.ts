import { describe, it, expect, vi, afterEach } from "vitest"
import { normalizeBalances, round2, type TreasuryToken } from "@/lib/financials/treasury/shapes"

// The BSC JSON-RPC transport (`bscRpcCall`) is mocked at the module boundary —
// the real one routes through tlsfetch (wasm browser-emulation), which we don't
// want to load or hit the network for in unit tests. `bscRpcMock` stands in for
// it; `fetch` is still stubbed for the Binance BNB-price call.
const { bscRpcMock } = vi.hoisted(() => ({ bscRpcMock: vi.fn() }))
vi.mock("@/lib/financials/treasury/source/bsc-rpc", () => ({ bscRpcCall: bscRpcMock }))

// Imported after the mock is registered so `live` picks up the stubbed transport.
const { fetchWalletBalances, fetchTreasurySnapshot } = await import(
  "@/lib/financials/treasury/source/live"
)

// A JSON-RPC batch stub: results are returned in request order. The provider
// sends [eth_getBalance, balanceOf(USDT), balanceOf(USDC), balanceOf(BUSD),
// balanceOf(WBNB)] per wallet. hex amounts below are 18-decimal wei.
function hex18(n: number): string {
  return "0x" + (BigInt(n) * 10n ** 18n).toString(16)
}

/** Mocks the transport: `bscRpcCall` answers both the per-wallet balance batch
 *  (array payload → results in request order) and the single PancakeSwap
 *  `getReserves()` call for the BNB price (WBNB=1, BUSD=bnbPrice → price). */
function mockRpc(opts: { bnb?: number; usdt?: number; usdc?: number; busd?: number; wbnb?: number; bnbPrice?: number }) {
  const pad = (x: bigint) => x.toString(16).padStart(64, "0")
  bscRpcMock.mockImplementation(async (payload: unknown) => {
    if (Array.isArray(payload)) {
      const results = [
        hex18(opts.bnb ?? 0),
        hex18(opts.usdt ?? 0),
        hex18(opts.usdc ?? 0),
        hex18(opts.busd ?? 0),
        hex18(opts.wbnb ?? 0),
      ]
      return payload.map((r: { id: number }) => ({ jsonrpc: "2.0", id: r.id, result: results[r.id] }))
    }
    // Single eth_call = PancakeSwap WBNB/BUSD getReserves → [reserve0 WBNB][reserve1 BUSD][ts].
    const price = BigInt(opts.bnbPrice ?? 600)
    return {
      jsonrpc: "2.0",
      id: 1,
      result: "0x" + pad(10n ** 18n) + pad(price * 10n ** 18n) + pad(0n),
    }
  })
  return bscRpcMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  bscRpcMock.mockReset()
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
    bscRpcMock.mockRejectedValue(new Error("BSC RPC 502"))
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ price: "600" }) })),
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
