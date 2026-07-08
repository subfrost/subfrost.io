// frBTC volume indexer client for the Financials → Revenue tab. Server-only: it
// talks to a dedicated metashrew WASM indexer (crates/frbtc-volume-indexer) that
// runs in its own rockshrew-mono instance and exposes two view functions over
// JSON-RPC method `metashrew_view` with params [viewName, hexJsonInput, heightTag].
//
// This is the AUTHORITATIVE on-chain source for BTC wrap/unwrap fee revenue —
// derived straight from confirmed frBTC wrap/unwrap events on-chain, rather than
// the WrapTransaction/UnwrapTransaction Prisma tables (which depend on the app's
// own sync). When FRBTC_INDEXER_RPC_URL is unset, getFrbtcVolumeRange() returns
// null so callers fall back to the table-based path.
//
// Result is memoized in-process for a short TTL (mirrors stripeRevenue.ts) so the
// page stays fast and we don't re-hit the indexer on every render / refresh.

/** One UTC day's frBTC volume, as returned by `frbtc_volume_range`.
 *  - `wrapped_sats`   gross BTC deposited to the signer on op-77 wraps.
 *  - `unwrapped_sats` BTC settled to redeemers on op-78 unwraps (1:1 w/ burn).
 *  - `swept_sats`     signer outflows that are NOT unwrap settlements (reserve /
 *                     fee withdrawals off the signer).
 *  - `miner_sats`     Bitcoin miner fees the signer paid to settle/consolidate. */
export interface FrbtcDailyBucket {
  date: string // YYYY-MM-DD
  wrapped_sats: number
  unwrapped_sats: number
  swept_sats: number
  miner_sats: number
  wrap_count: number
  unwrap_count: number
}

/** Range totals from `frbtc_volume_range`.
 *  `minted_sats`      = frBTC minted = wrapped − premium (0.999× at default).
 *  `fee_revenue_sats` = the 0.1% wrap premium — the ONLY protocol fee (unwraps
 *                       are 1:1, no fee). Accrues as BTC in the signer wallet.
 *  `swept_sats`       = BTC withdrawn off the signer that is not an unwrap.
 *  `miner_sats`       = total Bitcoin miner fees the signer paid. */
export interface FrbtcVolumeTotals {
  wrapped_sats: number
  minted_sats: number
  unwrapped_sats: number
  volume_sats: number
  fee_revenue_sats: number
  swept_sats: number
  miner_sats: number
}

/** Full `frbtc_volume_range` payload: per-day buckets + range totals. */
export interface FrbtcVolumeRange {
  daily: FrbtcDailyBucket[]
  totals: FrbtcVolumeTotals
}

/** `frbtc_volume_tip` payload: the last height the indexer has processed. */
export interface FrbtcVolumeTip {
  tip: number
}

const TTL_MS = 60_000 // memoize the indexer pull for a minute, like stripeRevenue

// Per-view memo caches (range keyed by from/to; tip has a single slot).
const rangeCache = new Map<string, { at: number; data: FrbtcVolumeRange }>()
let tipCache: { at: number; data: FrbtcVolumeTip } | null = null

/** UTF-8 → "0x"-prefixed hex, for encoding a view's raw-JSON input. */
function toHex(s: string): string {
  return "0x" + Buffer.from(s, "utf8").toString("hex")
}

/** Robustly turn a `metashrew_view` result into a parsed object. The view's
 *  exported bytes may come back as: an already-decoded object/array; a plain
 *  JSON string; or a "0x…" hex string. For the hex case, metashrew's
 *  `export_bytes` framing is `[u32-LE length][JSON payload][zero padding]`
 *  (confirmed against a live `frbtc_volume_tip`: 0x0e000000 + `{"tip":…}` +
 *  NUL padding), so we read the length prefix and slice exactly that many
 *  bytes. Falls back to whole-buffer utf8 (NUL-trimmed) if the prefix doesn't
 *  look like a valid length — tolerating hosts that return unframed JSON. */
function decodeResult(result: unknown): unknown {
  if (result == null) return null
  if (typeof result === "object") return result // already decoded (object/array)
  if (typeof result !== "string") return result
  let text = result
  if (/^0x[0-9a-fA-F]*$/.test(text)) {
    const buf = Buffer.from(text.slice(2), "hex")
    if (buf.length >= 4) {
      const len = buf.readUInt32LE(0)
      if (len > 0 && len <= buf.length - 4) {
        const framed = buf.subarray(4, 4 + len).toString("utf8")
        try {
          return JSON.parse(framed)
        } catch {
          /* not length-framed after all — fall through to whole-buffer */
        }
      }
    }
    text = buf.toString("utf8").replace(/\0+$/, "").trim()
  }
  return JSON.parse(text)
}

/** POST a single `metashrew_view` call. `input` is raw JSON, hex-encoded per the
 *  indexer contract. Throws on missing env, transport error, or JSON-RPC error —
 *  callers catch and fall back to the table-based path. */
async function callView(viewName: string, input: unknown): Promise<unknown> {
  const url = process.env.FRBTC_INDEXER_RPC_URL
  if (!url) throw new Error("FRBTC_INDEXER_RPC_URL is not set")

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "metashrew_view",
      params: [viewName, toHex(JSON.stringify(input)), "latest"],
    }),
  })
  if (!res.ok) throw new Error(`frBTC indexer RPC ${res.status}`)
  const body = (await res.json()) as { result?: unknown; error?: { message?: string } }
  if (body.error) throw new Error(`frBTC indexer view ${viewName}: ${body.error.message ?? "error"}`)
  return decodeResult(body.result)
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Fetch per-day frBTC wrap/unwrap volume + fee totals for [from, to]
 *  (YYYY-MM-DD, inclusive). Returns null when FRBTC_INDEXER_RPC_URL is unset so
 *  callers fall back to the ledger tables. Throws on transport/parse errors (the
 *  action layer catches those and falls back too). Memoized for TTL_MS.
 *
 *  NOTE: day-bucket sats are small in practice, so Number is safe here even though
 *  the indexer's integers could in theory exceed 2^53. */
export async function getFrbtcVolumeRange(from: string, to: string): Promise<FrbtcVolumeRange | null> {
  if (!process.env.FRBTC_INDEXER_RPC_URL) return null
  const key = `${from}|${to}`
  const hit = rangeCache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data

  const raw = (await callView("frbtc_volume_range", { from, to })) as {
    daily?: unknown[]
    totals?: Record<string, unknown>
  }
  const daily: FrbtcDailyBucket[] = (raw?.daily ?? []).map((d) => {
    const r = d as Record<string, unknown>
    return {
      date: String(r.date),
      wrapped_sats: num(r.wrapped_sats),
      unwrapped_sats: num(r.unwrapped_sats),
      swept_sats: num(r.swept_sats),
      miner_sats: num(r.miner_sats),
      wrap_count: num(r.wrap_count),
      unwrap_count: num(r.unwrap_count),
    }
  })
  const t = raw?.totals ?? {}
  const totals: FrbtcVolumeTotals = {
    wrapped_sats: num(t.wrapped_sats),
    minted_sats: num(t.minted_sats),
    unwrapped_sats: num(t.unwrapped_sats),
    volume_sats: num(t.volume_sats),
    fee_revenue_sats: num(t.fee_revenue_sats),
    swept_sats: num(t.swept_sats),
    miner_sats: num(t.miner_sats),
  }
  const data: FrbtcVolumeRange = { daily, totals }
  rangeCache.set(key, { at: Date.now(), data })
  return data
}

/** Fetch the last height the indexer has processed. Returns null when
 *  FRBTC_INDEXER_RPC_URL is unset. Throws on transport/parse errors. Memoized. */
export async function getFrbtcVolumeTip(): Promise<FrbtcVolumeTip | null> {
  if (!process.env.FRBTC_INDEXER_RPC_URL) return null
  if (tipCache && Date.now() - tipCache.at < TTL_MS) return tipCache.data
  const raw = (await callView("frbtc_volume_tip", {})) as { tip?: unknown }
  const data: FrbtcVolumeTip = { tip: num(raw?.tip) }
  tipCache = { at: Date.now(), data }
  return data
}

/** Read frBTC (alkane 32:0) `/totalsupply` via `getstorageat` on the MAIN
 *  alkanes indexer (the `FRBTC_INDEXER_RPC_URL` base with the `/frbtc` suffix
 *  stripped) so the Revenue tab can reconcile supply against the signer reserve
 *  (net wrap−unwrap). Returns supply in sats, or null on any failure/unset env.
 *
 *  The request payload is the protobuf `AlkaneStorageRequest{ id:{32,0},
 *  path:"/totalsupply" }`; the reply is protobuf field 1 (a length-delimited
 *  little-endian u128 of sats). */
export async function getFrbtcTotalSupplySats(): Promise<number | null> {
  const url = process.env.FRBTC_INDEXER_RPC_URL
  if (!url) return null
  const base = url.replace(/\/frbtc\/?$/, "")
  const KEY = "0x0a060a0208201200120c2f746f74616c737570706c79"
  try {
    const res = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "metashrew_view",
        params: ["getstorageat", KEY, "latest"],
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    })
    if (!res.ok) return null
    const body = (await res.json()) as { result?: string }
    const r = body.result
    if (typeof r !== "string" || !r.startsWith("0x")) return null
    const buf = Buffer.from(r.slice(2), "hex")
    if (buf.length < 2 || buf[0] !== 0x0a) return null // expect protobuf field 1
    const len = buf[1]
    const val = buf.subarray(2, 2 + len)
    let v = 0n
    for (let k = val.length - 1; k >= 0; k--) v = (v << 8n) | BigInt(val[k])
    const sats = Number(v)
    return Number.isFinite(sats) && sats > 0 ? sats : null
  } catch {
    return null
  }
}

/** Test-only: clear the in-process memo caches. */
export function __clearFrbtcIndexerCache(): void {
  rangeCache.clear()
  tipCache = null
}
