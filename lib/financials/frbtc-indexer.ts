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

/** One UTC day's frBTC volume, as returned by `frbtc_volume_range`. */
export interface FrbtcDailyBucket {
  date: string // YYYY-MM-DD
  wrapped_sats: number
  unwrapped_sats: number
  wrap_count: number
  unwrap_count: number
}

/** Range totals from `frbtc_volume_range`. fee_revenue_sats = 0.3% of volume. */
export interface FrbtcVolumeTotals {
  wrapped_sats: number
  unwrapped_sats: number
  volume_sats: number
  fee_revenue_sats: number
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
      wrap_count: num(r.wrap_count),
      unwrap_count: num(r.unwrap_count),
    }
  })
  const t = raw?.totals ?? {}
  const totals: FrbtcVolumeTotals = {
    wrapped_sats: num(t.wrapped_sats),
    unwrapped_sats: num(t.unwrapped_sats),
    volume_sats: num(t.volume_sats),
    fee_revenue_sats: num(t.fee_revenue_sats),
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

/** Test-only: clear the in-process memo caches. */
export function __clearFrbtcIndexerCache(): void {
  rangeCache.clear()
  tipCache = null
}
