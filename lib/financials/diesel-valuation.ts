// DIESEL → USD historical valuation.
//
// Prices a DIESEL payment in USD *as of the block it settled in*, using the
// on-chain DIESEL/frBTC AMM pool reserves at that height and the historical
// BTC/USD spot at the block's time:
//
//   dieselUsd = (frBTC_reserve / DIESEL_reserve) × BTC_USD
//
// Both reserves come out of the pool's opcode-97 (`get-reserves`) response as
// u128 subunits with 8 decimals each, so the 1e8 scaling cancels in the ratio
// and `ratio` is plainly "BTC per DIESEL".
//
// Data sources (both reachable via Node `fetch` — verified past the tlsd JA4
// filter, unlike python urllib):
//   • reserves : subfrost JSON-RPC `metashrew_view simulate` pinned to a height
//   • BTC/USD  : mempool.space historical-price at the block's unix time
//
// This module is DB-free: `dieselUsdAtBlock` only touches the network. The
// read-through cache lives in the server action (actions/cms/financials-diesel)
// which passes a `cache` map into `valuePayments`.

const SUBFROST_RPC_URL = "https://mainnet.subfrost.io/v4/subfrost"
const MEMPOOL_PRICE_URL = "https://mempool.space/api/v1/historical-price"

// DIESEL/frBTC LP pool alkane id (block:tx) and the get-reserves opcode.
// Mirrors subfrost-wallet-api/src/system_health.rs (DIESEL_FRBTC_POOL_* / 97).
const POOL_BLOCK = 2
const POOL_TX = 77_087
const RESERVES_OPCODE = 97

function leb128(value: number): number[] {
  const out: number[] = []
  let v = value
  do {
    let byte = v & 0x7f
    v = Math.floor(v / 128)
    if (v !== 0) byte |= 0x80
    out.push(byte)
  } while (v !== 0)
  return out
}

/** Build the `metashrew_view simulate` calldata hex the pool reserves probe
 *  uses: `0x2a <len> <leb(block)> <leb(tx)> <leb(opcode)>`. For (2,77087,97)
 *  this is `0x2a05029fda0461`. */
export function buildReservesHex(block = POOL_BLOCK, tx = POOL_TX, opcode = RESERVES_OPCODE): string {
  const calldata = [...leb128(block), ...leb128(tx), ...leb128(opcode)]
  const msg = [0x2a, calldata.length, ...calldata]
  return "0x" + msg.map((b) => b.toString(16).padStart(2, "0")).join("")
}

function leBytesToBigInt(bytes: Uint8Array): bigint {
  let acc = 0n
  for (let i = bytes.length - 1; i >= 0; i--) acc = (acc << 8n) | BigInt(bytes[i])
  return acc
}

export interface PoolReserves {
  dieselReserve: number // subunits (8 decimals)
  frbtcReserve: number // subunits (8 decimals / sats)
}

/** Decode the opcode-97 response: protobuf field 3 (`0x1a 0x20`) carries 32
 *  bytes = two little-endian u128s, DIESEL reserve then frBTC reserve. */
export function parsePoolReserves(resultHex: string): PoolReserves | null {
  const h = resultHex.trim().replace(/^0x/, "")
  if (!/^[0-9a-fA-F]*$/.test(h) || h.length % 2 !== 0) return null
  const bytes = new Uint8Array(h.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  // locate the `1a 20` tag
  let pos = -1
  for (let i = 0; i + 1 < bytes.length; i++) {
    if (bytes[i] === 0x1a && bytes[i + 1] === 0x20) { pos = i; break }
  }
  if (pos < 0) return null
  const start = pos + 2
  if (bytes.length < start + 32) return null
  const diesel = leBytesToBigInt(bytes.subarray(start, start + 16))
  const frbtc = leBytesToBigInt(bytes.subarray(start + 16, start + 32))
  return { dieselReserve: Number(diesel), frbtcReserve: Number(frbtc) }
}

async function rpc(method: string, params: unknown[], timeoutMs = 20_000): Promise<unknown> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(SUBFROST_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: ctrl.signal,
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`subfrost rpc ${res.status}`)
    const json = (await res.json()) as { result?: unknown; error?: { message?: string } }
    if (json.error) throw new Error(json.error.message ?? "rpc error")
    return json.result
  } finally {
    clearTimeout(t)
  }
}

/** Pool reserves at a specific block height (or "latest"). */
export async function reservesAtHeight(height: number | "latest"): Promise<PoolReserves | null> {
  const hex = buildReservesHex()
  const result = await rpc("metashrew_view", ["simulate", hex, String(height)])
  if (typeof result !== "string") return null
  return parsePoolReserves(result)
}

/** Historical BTC/USD spot at a unix timestamp (seconds), via mempool.space. */
export async function btcUsdAt(unixSeconds: number, timeoutMs = 15_000): Promise<number | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${MEMPOOL_PRICE_URL}?currency=USD&timestamp=${unixSeconds}`, {
      signal: ctrl.signal,
      cache: "no-store",
    })
    if (!res.ok) return null
    const json = (await res.json()) as { prices?: Array<{ USD?: number }> }
    const usd = json.prices?.[0]?.USD
    return typeof usd === "number" && usd > 0 ? usd : null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

export interface DieselValuation {
  dieselUsd: number // USD per 1 DIESEL at the block
  paymentUsd: number // dieselUsd × amountDiesel
  btcUsd: number // BTC/USD spot at the block's time
  ratio: number // BTC per DIESEL (frBTC_reserve / DIESEL_reserve)
  source: "computed" | "cache"
}

/** Price one DIESEL payment as of `blockHeight` / `paidAtUnix`. Network-only,
 *  DB-free. Returns null if either data source is unavailable (caller shows
 *  "—" gracefully). */
export async function dieselUsdAtBlock(
  blockHeight: number,
  paidAtUnix: number,
  amountDiesel: number,
): Promise<DieselValuation | null> {
  const [reserves, btcUsd] = await Promise.all([
    reservesAtHeight(blockHeight).catch(() => null),
    btcUsdAt(paidAtUnix).catch(() => null),
  ])
  if (!reserves || !btcUsd) return null
  if (reserves.dieselReserve <= 0 || reserves.frbtcReserve <= 0) return null
  const ratio = reserves.frbtcReserve / reserves.dieselReserve // BTC per DIESEL
  const dieselUsd = ratio * btcUsd
  if (!Number.isFinite(dieselUsd) || dieselUsd <= 0) return null
  return {
    dieselUsd,
    paymentUsd: dieselUsd * amountDiesel,
    btcUsd,
    ratio,
    source: "computed",
  }
}

export interface PaymentToValue {
  id: string
  blockHeight: number | null
  paidAtUnix: number
  amountDiesel: number
}

/** Pre-priced value for a block, as stored in DieselPriceCache. */
export interface CachedBlockPrice {
  dieselUsd: number
  btcUsd: number
  ratio: number
}

export interface ValuePaymentsResult {
  /** paymentId → valuation (only for payments we could price). */
  values: Record<string, DieselValuation>
  /** blockHeight → freshly computed price, for the caller to persist to cache. */
  computed: Record<number, CachedBlockPrice>
}

/** Batch-price payments, reading through a caller-supplied per-block cache.
 *
 *  `cache` maps blockHeight → already-known price (from DieselPriceCache). Any
 *  block not in the cache is fetched once (deduped across payments sharing a
 *  block) and reported back in `computed` so the caller can persist it. Pure of
 *  DB access — the server action owns the read/write of the cache table. */
export async function valuePayments(
  payments: PaymentToValue[],
  cache: Record<number, CachedBlockPrice> = {},
): Promise<ValuePaymentsResult> {
  const values: Record<string, DieselValuation> = {}
  const computed: Record<number, CachedBlockPrice> = {}

  // Distinct blocks that still need pricing (skip payments with no height).
  const priced: Record<number, CachedBlockPrice | null> = {}
  const missing: Array<{ height: number; paidAtUnix: number }> = []
  for (const p of payments) {
    if (p.blockHeight == null) continue
    if (cache[p.blockHeight]) {
      priced[p.blockHeight] = cache[p.blockHeight]
    } else if (!(p.blockHeight in priced)) {
      priced[p.blockHeight] = null
      missing.push({ height: p.blockHeight, paidAtUnix: p.paidAtUnix })
    }
  }

  // Fetch each missing block once (bounded concurrency).
  const CONCURRENCY = 4
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const chunk = missing.slice(i, i + CONCURRENCY)
    await Promise.all(
      chunk.map(async ({ height, paidAtUnix }) => {
        const v = await dieselUsdAtBlock(height, paidAtUnix, 1).catch(() => null)
        if (v) {
          const price: CachedBlockPrice = { dieselUsd: v.dieselUsd, btcUsd: v.btcUsd, ratio: v.ratio }
          priced[height] = price
          computed[height] = price
        }
      }),
    )
  }

  for (const p of payments) {
    if (p.blockHeight == null) continue
    const price = priced[p.blockHeight]
    if (!price) continue
    values[p.id] = {
      dieselUsd: price.dieselUsd,
      paymentUsd: price.dieselUsd * p.amountDiesel,
      btcUsd: price.btcUsd,
      ratio: price.ratio,
      source: cache[p.blockHeight] ? "cache" : "computed",
    }
  }

  return { values, computed }
}
