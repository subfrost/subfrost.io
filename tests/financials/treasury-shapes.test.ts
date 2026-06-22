import { describe, it, expect } from "vitest"
import { normalizeBalances, type GoldRushItem } from "@/lib/financials/treasury/shapes"

const items: GoldRushItem[] = [
  { contract_address: "0xnative", contract_ticker_symbol: "BNB", contract_name: "BNB",
    contract_decimals: 18, balance: "1500000000000000000", quote: 900, native_token: true, is_spam: false },
  { contract_address: "0xusdt", contract_ticker_symbol: "USDT", contract_name: "Tether USD",
    contract_decimals: 18, balance: "2000000000000000000000", quote: 2000, native_token: false, is_spam: false },
  { contract_address: "0xnoprice", contract_ticker_symbol: "XYZ", contract_name: "No Price",
    contract_decimals: 18, balance: "5000000000000000000", quote: null, native_token: false, is_spam: false },
  { contract_address: "0xspam", contract_ticker_symbol: "SPAM", contract_name: "Spam",
    contract_decimals: 18, balance: "9999000000000000000000", quote: 9999, native_token: false, is_spam: true },
  { contract_address: "0xzero", contract_ticker_symbol: "ZERO", contract_name: "Zero",
    contract_decimals: 18, balance: "0", quote: 0, native_token: false, is_spam: false },
]

describe("normalizeBalances", () => {
  const w = normalizeBalances(items, "0xWALLET", "Main")

  it("keeps non-spam, non-zero tokens and drops spam + zero balances", () => {
    expect(w.tokens.map((t) => t.symbol)).toEqual(["USDT", "BNB", "XYZ"]) // sorted by usd desc, nulls last
    expect(w.tokens.find((t) => t.symbol === "SPAM")).toBeUndefined()
    expect(w.tokens.find((t) => t.symbol === "ZERO")).toBeUndefined()
  })

  it("applies decimals, maps native + usd, and keeps no-price tokens as usd null", () => {
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
      [{ contract_address: "0xz", contract_ticker_symbol: "ZP", contract_name: "Zero Priced",
         contract_decimals: 18, balance: "1000000000000000000", quote: 0, native_token: false, is_spam: false }],
      "0xW",
    )
    expect(z.tokens[0].usd).toBe(0)
  })
})
