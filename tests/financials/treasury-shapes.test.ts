import { describe, it, expect } from "vitest"
import { normalizeBalances, type TreasuryToken } from "@/lib/financials/treasury/shapes"

// normalizeBalances is now a pure post-processor over already-priced tokens:
// it drops zero balances, sorts by usd desc (nulls last), and totals known usd.
const tokens: TreasuryToken[] = [
  { contract: "0xnative", symbol: "BNB", name: "BNB", amount: 1.5, usd: 900, isNative: true },
  { contract: "0xusdt", symbol: "USDT", name: "Tether USD", amount: 2000, usd: 2000, isNative: false },
  { contract: "0xnoprice", symbol: "XYZ", name: "No Price", amount: 5, usd: null, isNative: false },
  { contract: "0xzero", symbol: "ZERO", name: "Zero", amount: 0, usd: 0, isNative: false },
]

describe("normalizeBalances", () => {
  const w = normalizeBalances(tokens, "0xWALLET", "Main")

  it("keeps non-zero tokens (sorted by usd desc, nulls last) and drops zero balances", () => {
    expect(w.tokens.map((t) => t.symbol)).toEqual(["USDT", "BNB", "XYZ"])
    expect(w.tokens.find((t) => t.symbol === "ZERO")).toBeUndefined()
  })

  it("carries amount, native flag, and keeps no-price tokens as usd null", () => {
    const bnb = w.tokens.find((t) => t.symbol === "BNB")!
    expect(bnb.amount).toBe(1.5)
    expect(bnb.isNative).toBe(true)
    expect(bnb.usd).toBe(900)
    expect(w.tokens.find((t) => t.symbol === "XYZ")!.usd).toBeNull()
  })

  it("totals only known USD and carries address + label", () => {
    expect(w.totalUsd).toBe(2900) // 2000 + 900, XYZ (null) contributes 0
    expect(w.address).toBe("0xWALLET")
    expect(w.label).toBe("Main")
  })

  it("keeps a priced-at-zero token as usd 0, not null", () => {
    const z = normalizeBalances(
      [{ contract: "0xz", symbol: "ZP", name: "Zero Priced", amount: 1, usd: 0, isNative: false }],
      "0xW",
    )
    expect(z.tokens[0].usd).toBe(0)
  })
})
