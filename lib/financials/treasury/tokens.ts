// BSC token registry for the treasury balance reader.
//
// Each wallet in `config.ts` is polled for the native coin (BNB) plus every
// ERC-20 (BEP-20) listed here, via direct JSON-RPC `eth_call` of
// `balanceOf(address)`. A wrong contract address here means a wrong balance,
// so the stablecoin addresses are cross-checked against the wallet stack's
// verified table (`subfrost-wallet-common/src/xchain.rs`).

/** How a token's USD value is derived at read time. `none` ⇒ quantity-only
 *  (usd stays null, matching the previous provider's no-price behaviour). */
export type PriceKind = "stable" | "btc" | "bnb" | "diesel" | "none"

export interface BscToken {
  /** ERC-20 contract, or the sentinel `"native"` for BNB. */
  contract: string
  symbol: string
  name: string
  decimals: number
  isNative: boolean
  price: PriceKind
}

/** Native BNB — read via `eth_getBalance`, not `balanceOf`. */
export const NATIVE_BNB: BscToken = {
  contract: "native",
  symbol: "BNB",
  name: "BNB",
  decimals: 18,
  isNative: true,
  price: "bnb",
}

/** ERC-20 (BEP-20) tokens polled per wallet. Stablecoins priced 1:1.
 *  USDT/USDC addresses + decimals verified against xchain.rs. */
export const BSC_TOKENS: BscToken[] = [
  {
    contract: "0x55d398326f99059fF775485246999027B3197955",
    symbol: "USDT",
    name: "Tether USD (BSC)",
    decimals: 18,
    isNative: false,
    price: "stable",
  },
  {
    contract: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    symbol: "USDC",
    name: "USD Coin (BSC)",
    decimals: 18,
    isNative: false,
    price: "stable",
  },
  {
    contract: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
    symbol: "BUSD",
    name: "Binance USD",
    decimals: 18,
    isNative: false,
    price: "stable",
  },
  {
    contract: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    symbol: "WBNB",
    name: "Wrapped BNB",
    decimals: 18,
    isNative: false,
    price: "bnb",
  },
  // TODO(frBTC/BSC): frBTC has no known BSC/BEP-20 deployment. It lives as an
  // alkane on Bitcoin (block:tx 32:0) and as a BRC2.0-prog contract at
  // 0xdBB5b6A1D422fca2813cF486e5F986ADB09D8337 (that is the BRC2.0 EVM chain,
  // NOT BSC). If a canonical BSC frBTC contract is confirmed, add it here with
  // `price: "btc"` — the pricing path (amount × BTC spot) is already wired up.
  // {
  //   contract: "0x…", symbol: "frBTC", name: "frBTC (BSC)",
  //   decimals: 8, isNative: false, price: "btc",
  // },
  //
  // TODO(DIESEL/BSC): DIESEL is a Bitcoin alkane (block:tx 2:0) with no known
  // BSC/BEP-20 deployment. If one is confirmed, add it here with
  // `price: "diesel"` (amount × DIESEL spot, derived from the frBTC/DIESEL pool
  // reserves × BTC spot — the pricing path is already wired up). Absent a
  // verified address, we do NOT guess one.
  // {
  //   contract: "0x…", symbol: "DIESEL", name: "DIESEL (BSC)",
  //   decimals: 8, isNative: false, price: "diesel",
  // },
]

/** The distinct set of price kinds present in the registry — lets the reader
 *  fetch only the spot prices it actually needs (no wasted network calls). */
export function requiredPriceKinds(): Set<PriceKind> {
  return new Set<PriceKind>([NATIVE_BNB, ...BSC_TOKENS].map((t) => t.price))
}
