import { TELEMETRY_ES_URL } from "@/lib/telemetry/access-event"

const ISO = /^\d{4}-\d{2}-\d{2}$/
const DAYS_AGO = /^(\d+)daysAgo$/

function toEsDate(v: string, fallback: string): string {
  if (v === "today") return "now/d"
  const m = DAYS_AGO.exec(v)
  if (m) return `now-${m[1]}d/d`
  if (ISO.test(v)) return v
  return fallback
}

/** DateRange (GA4-style presets or custom ISO) → ES date-math bounds. */
export function esRangeBounds(r: { start: string; end: string }): { gte: string; lte: string } {
  return { gte: toEsDate(r.start, "now/d"), lte: toEsDate(r.end, "now/d") }
}

export const ES_INDEX = "subfrost-cdn-*"

/** Painless runtime fields read from _source so aggregations survive the
 *  heterogeneous per-index mappings in the re-indexed dump (ja4/path are
 *  keyword in some indices, text+keyword in others). visitor_key = ja4|ip;
 *  session_key adds a 30-min window (doc['ts'] is a date in every index);
 *  path_src/referer_src expose path/headers.referer uniformly. Verified live:
 *  these run across all 12 shards with failed:0. */
export const RUNTIME_MAPPINGS = {
  visitor_key: { type: "keyword", script: { source: "def s=params._source; if (s!=null && s.ja4!=null) { def ip = s.source_ip!=null ? s.source_ip : ''; emit(s.ja4 + '|' + ip) }" } },
  session_key: { type: "keyword", script: { source: "def s=params._source; if (s!=null && s.ja4!=null) { def ip = s.source_ip!=null ? s.source_ip : ''; long t = doc['ts'].value.toInstant().toEpochMilli(); long w = t - (t % 1800000L); emit(s.ja4 + '|' + ip + '|' + w) }" } },
  path_src: { type: "keyword", script: { source: "if (params._source!=null && params._source.path!=null) { emit(params._source.path) }" } },
  referer_src: { type: "keyword", script: { source: "def s=params._source; if (s!=null && s.headers!=null && s.headers.referer!=null) { emit(s.headers.referer) }" } },
} as const

/** Guarded ES _search over subfrost-cdn-*; returns parsed body or null (never
 *  throws). Mirrors ga4.runReport's guard pattern. */
export async function esSearch(body: Record<string, unknown>): Promise<any | null> {
  try {
    const res = await fetch(`${TELEMETRY_ES_URL}/${ES_INDEX}/_search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
