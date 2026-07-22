// frBTC-on-BRC20-Prog volume indexer client. Server-only.
//
// This is the AUTHORITATIVE source for BRC2.0 (brc20-prog) frBTC wrap/unwrap
// volume — the second frBTC venue's sibling of the alkanes frBTC indexer
// (lib/financials/frbtc-indexer.ts). It talks to a dedicated metashrew WASM
// indexer (subfrost.io/crates/frbtc-brc20-volume-indexer) that runs in its own
// rockshrew-mono instance in the subvh cluster and decodes the BRC20-Prog frBTC
// signer's on-chain wrap (OP_RETURN "BRC20PROG" marker) / unwrap flows. It is
// reached via the alkanes-jsonrpc edge route /v4/jsonrpc/frbtc-brc20 and exposes
// the SAME view functions as the alkanes /frbtc indexer over JSON-RPC method
// `metashrew_view` with params [viewName, hexJsonInput, heightTag]:
//   - frbtc_volume_range { from, to } → per-UTC-day wrap/unwrap sats + totals
//   - frbtc_volume_tip {}             → last indexed Bitcoin height
//
// This replaces the previous mempool.space signer-address-scanning heuristic in
// lib/volume-data.ts. When FRBTC_BRC20_INDEXER_RPC_URL is unset, the range fetch
// returns null so callers degrade to empty BRC20 data (the /api/volume/* routes
// canonically re-fetch production on preview/localhost anyway).

/** One UTC day's frBTC-on-BRC20-Prog volume, from `frbtc_volume_range`. */
export interface Brc20DailyBucket {
  date: string // YYYY-MM-DD
  wrapped_sats: number
  unwrapped_sats: number
  wrap_count: number
  unwrap_count: number
}

/** Range totals from `frbtc_volume_range`. */
export interface Brc20VolumeTotals {
  wrapped_sats: number
  unwrapped_sats: number
  volume_sats: number
  wrap_count: number
  unwrap_count: number
}

/** Full `frbtc_volume_range` payload: per-day buckets + range totals. */
export interface Brc20VolumeRange {
  daily: Brc20DailyBucket[]
  totals: Brc20VolumeTotals
}

// The indexer buckets by day and only returns days it has data for. `from` is
// before any BRC20-Prog frBTC activity; `to` must stay near the present — a
// far-future upper bound (e.g. 2099) makes the view return an empty range — so
// we compute it as today + a small buffer for UTC-boundary/clock safety.
const RANGE_FROM = "2025-01-01"
const TO_BUFFER_DAYS = 2
const TTL_MS = 15 * 60 * 1000 // match lib/volume-data.ts's 15-min warm cache

/** Upper bound for the range query: today (UTC) + buffer, as YYYY-MM-DD. */
function rangeTo(): string {
  return new Date(Date.now() + TO_BUFFER_DAYS * 86_400_000).toISOString().slice(0, 10)
}

// Memo keyed by the computed `to` so it naturally refreshes as days roll over.
let rangeCache: { at: number; to: string; data: Brc20VolumeRange } | null = null

/** UTF-8 → "0x"-prefixed hex, for encoding a view's raw-JSON input. */
function toHex(s: string): string {
  return "0x" + Buffer.from(s, "utf8").toString("hex")
}

/** Turn a `metashrew_view` result into a parsed object. The exported bytes may
 *  come back as: an already-decoded object; a plain JSON string; or a "0x…" hex
 *  string framed as `[u32-LE length][JSON payload][zero padding]` (metashrew's
 *  `export_bytes`). Read the length prefix and slice exactly that many bytes,
 *  falling back to whole-buffer utf8 (NUL-trimmed) for unframed hosts. */
function decodeResult(result: unknown): unknown {
  if (result == null) return null
  if (typeof result === "object") return result
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

/** POST a single `metashrew_view` call against the BRC20-Prog frBTC indexer. */
async function callView(viewName: string, input: unknown): Promise<unknown> {
  const url = process.env.FRBTC_BRC20_INDEXER_RPC_URL
  if (!url) throw new Error("FRBTC_BRC20_INDEXER_RPC_URL is not set")

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "metashrew_view",
      params: [viewName, toHex(JSON.stringify(input)), "latest"],
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`frBTC-brc20 indexer RPC ${res.status}`)
  const body = (await res.json()) as { result?: unknown; error?: { message?: string } }
  if (body.error) throw new Error(`frBTC-brc20 indexer view ${viewName}: ${body.error.message ?? "error"}`)
  return decodeResult(body.result)
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Fetch per-day frBTC-on-BRC20-Prog wrap/unwrap volume + totals. Returns null
 *  when FRBTC_BRC20_INDEXER_RPC_URL is unset so callers degrade gracefully.
 *  Throws on transport/parse errors (callers catch and serve stale/empty).
 *  Memoized in-process for TTL_MS. */
export async function getBrc20VolumeRange(): Promise<Brc20VolumeRange | null> {
  if (!process.env.FRBTC_BRC20_INDEXER_RPC_URL) return null
  const to = rangeTo()
  if (rangeCache && rangeCache.to === to && Date.now() - rangeCache.at < TTL_MS) return rangeCache.data

  const raw = (await callView("frbtc_volume_range", { from: RANGE_FROM, to })) as {
    daily?: unknown[]
    totals?: Record<string, unknown>
  }
  const daily: Brc20DailyBucket[] = (raw?.daily ?? []).map((d) => {
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
  const totals: Brc20VolumeTotals = {
    wrapped_sats: num(t.wrapped_sats),
    unwrapped_sats: num(t.unwrapped_sats),
    volume_sats: num(t.volume_sats),
    wrap_count: num(t.wrap_count),
    unwrap_count: num(t.unwrap_count),
  }
  const data: Brc20VolumeRange = { daily, totals }
  rangeCache = { at: Date.now(), to, data }
  return data
}

/** Test-only: clear the in-process memo cache. */
export function __clearBrc20VolumeCache(): void {
  rangeCache = null
}
