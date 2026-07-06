import {
  normalizeBalances,
  round2,
  type TreasurySnapshot,
  type TreasuryToken,
  type TreasuryWallet,
} from "@/lib/financials/treasury/shapes"
import { TREASURY_WALLETS } from "@/lib/financials/treasury/config"
import { bscRpcCall } from "@/lib/financials/treasury/source/bsc-rpc"
import {
  BSC_TOKENS,
  NATIVE_BNB,
  requiredPriceKinds,
  type BscToken,
  type PriceKind,
} from "@/lib/financials/treasury/tokens"
import { reservesAtHeight } from "@/lib/financials/diesel-valuation"

const TIMEOUT_MS = 12_000

// ── EVM JSON-RPC over tlsfetch ─────────────────────────────────────────────
// Tiny hand-rolled client — one batched POST per wallet (native balance +
// balanceOf for every registry token). No wallet/RPC SDK dependency. The
// transport (`bscRpcCall`) routes each POST through tlsfetch browser-emulation
// so the datacenter egress isn't blocked/fingerprinted by the RPC.

interface RpcReq {
  method: string
  params: unknown[]
}

/** ERC-20 `balanceOf(address)` selector. */
const BALANCE_OF = "0x70a08231"

/** Build the `balanceOf` calldata: selector + 32-byte left-padded address. */
function balanceOfData(address: string): string {
  const addr = address.toLowerCase().replace(/^0x/, "")
  return BALANCE_OF + addr.padStart(64, "0")
}

/** Send a JSON-RPC batch, returning results in request order. Throws on any
 *  transport error or per-call error so the caller degrades to last-good. */
async function rpcBatch(reqs: RpcReq[]): Promise<string[]> {
  const body = reqs.map((r, i) => ({ jsonrpc: "2.0", id: i, method: r.method, params: r.params }))
  const json = (await bscRpcCall(body)) as
    | Array<{ id: number; result?: string; error?: { message?: string } }>
    | { error?: { message?: string } }
  if (!Array.isArray(json)) throw new Error(json?.error?.message ?? "BSC RPC batch error")
  const out = new Array<string>(reqs.length)
  for (const entry of json) {
    if (entry.error) throw new Error(entry.error.message ?? "BSC RPC call error")
    out[entry.id] = entry.result ?? "0x0"
  }
  return out
}

/** Hex uint256 → decimal amount, scaled by `decimals`. Uses BigInt for the
 *  integer part so 18-dec balances don't lose precision before the divide. */
function decodeAmount(hex: string, decimals: number): number {
  const clean = (hex ?? "0x0").trim()
  const wei = clean === "0x" || clean === "" ? 0n : BigInt(clean)
  if (wei === 0n) return 0
  const scale = 10n ** BigInt(decimals)
  const whole = wei / scale
  const frac = wei % scale
  return Number(whole) + Number(frac) / Number(scale)
}

// ── Spot pricing ────────────────────────────────────────────────────────────

interface SpotPrices {
  btcUsd: number | null
  bnbUsd: number | null
  dieselUsd: number | null
}

/** BTC/USD from the subfrost subpricer (past the tlsd JA4 filter via fetch). */
async function btcSpotUsd(): Promise<number | null> {
  try {
    const res = await fetch("https://mainnet.subfrost.io/v4/subfrost/get-bitcoin-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: { bitcoin?: { usd?: number } } }
    const usd = json?.data?.bitcoin?.usd
    return typeof usd === "number" && usd > 0 ? usd : null
  } catch {
    return null
  }
}

/** BNB/USD from Binance's public ticker (cheap, keyless). Null on any failure. */
async function bnbSpotUsd(): Promise<number | null> {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT", {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
    if (!res.ok) return null
    const json = (await res.json()) as { price?: string }
    const usd = json?.price != null ? Number(json.price) : NaN
    return Number.isFinite(usd) && usd > 0 ? usd : null
  } catch {
    return null
  }
}

/** DIESEL/USD = (frBTC/DIESEL pool ratio) × BTC spot, from the live reserves.
 *  Mirrors diesel-valuation's `dieselUsdAtBlock` but at the latest height. */
async function dieselSpotUsd(btcUsd: number): Promise<number | null> {
  try {
    const reserves = await reservesAtHeight("latest")
    if (!reserves || reserves.dieselReserve <= 0 || reserves.frbtcReserve <= 0) return null
    const ratio = reserves.frbtcReserve / reserves.dieselReserve // BTC per DIESEL
    const usd = ratio * btcUsd
    return Number.isFinite(usd) && usd > 0 ? usd : null
  } catch {
    return null
  }
}

/** Fetch only the spot prices the current registry needs. Stables need none. */
async function loadSpotPrices(kinds: Set<PriceKind>): Promise<SpotPrices> {
  const needBtc = kinds.has("btc") || kinds.has("diesel")
  const needBnb = kinds.has("bnb")
  const needDiesel = kinds.has("diesel")

  const [btcUsd, bnbUsd] = await Promise.all([
    needBtc ? btcSpotUsd() : Promise.resolve(null),
    needBnb ? bnbSpotUsd() : Promise.resolve(null),
  ])
  const dieselUsd = needDiesel && btcUsd != null ? await dieselSpotUsd(btcUsd) : null
  return { btcUsd, bnbUsd, dieselUsd }
}

/** amount → USD for a token, per its price kind. Null ⇒ quantity-only. */
function priceUsd(token: BscToken, amount: number, spot: SpotPrices): number | null {
  switch (token.price) {
    case "stable":
      return amount * 1
    case "btc":
      return spot.btcUsd != null ? amount * spot.btcUsd : null
    case "bnb":
      return spot.bnbUsd != null ? amount * spot.bnbUsd : null
    case "diesel":
      return spot.dieselUsd != null ? amount * spot.dieselUsd : null
    default:
      return null
  }
}

// ── Public API (signatures unchanged) ───────────────────────────────────────

/** One wallet's holdings via direct BSC JSON-RPC: native BNB + every registry
 *  ERC-20's `balanceOf`. Prices each token, drops zero balances. Throws on RPC
 *  failure so the caller (action/route) can serve last-good — never a silent
 *  partial snapshot. `prices` is passed by the snapshot fan-out so the spot
 *  fetch happens once; standalone callers get their own. */
export async function fetchWalletBalances(
  address: string,
  label?: string,
  prices?: SpotPrices,
): Promise<TreasuryWallet> {
  const spot = prices ?? (await loadSpotPrices(requiredPriceKinds()))

  const results = await rpcBatch([
    { method: "eth_getBalance", params: [address, "latest"] },
    ...BSC_TOKENS.map((t) => ({
      method: "eth_call",
      params: [{ to: t.contract, data: balanceOfData(address) }, "latest"] as unknown[],
    })),
  ])

  const registry = [NATIVE_BNB, ...BSC_TOKENS]
  const tokens: TreasuryToken[] = registry.map((t, i) => {
    const amount = decodeAmount(results[i], t.decimals)
    return {
      contract: t.contract,
      symbol: t.symbol,
      name: t.name,
      amount,
      usd: priceUsd(t, amount, spot),
      isNative: t.isNative,
    }
  })

  return normalizeBalances(tokens, address, label)
}

/** All treasury wallets in parallel + the grand USD total. Spot prices are
 *  fetched once and shared across wallets. */
export async function fetchTreasurySnapshot(): Promise<TreasurySnapshot> {
  const prices = await loadSpotPrices(requiredPriceKinds())
  const wallets = await Promise.all(
    TREASURY_WALLETS.map((w) => fetchWalletBalances(w.address, w.label, prices)),
  )
  const grandTotalUsd = round2(wallets.reduce((s, w) => s + w.totalUsd, 0))
  return { wallets, grandTotalUsd, fetchedAt: new Date().toISOString() }
}
