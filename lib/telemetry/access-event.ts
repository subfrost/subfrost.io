// Edge-safe (NO `os`/Node-only imports): used by the Edge middleware AND the
// nodejs /api/fp route. Shapes the strict subfrost-cdn-* access event from the
// tlsd X-TLS-* headers + request context, and fire-and-forgets it to ES.

export const TELEMETRY_ES_URL = (
  process.env.TELEMETRY_ES_URL ||
  "http://elasticsearch.telemetry.svc.cluster.local:9200"
).replace(/\/$/, "")

export interface AccessEventInput {
  ja3: string; ja3_full: string; ja4: string
  host: string; path: string; method: string; status: number
  sourceIp: string; userAgent: string; xff: string
  referer?: string; utm?: Record<string, string>
  instance: string; latencyMs: number
}

export interface AccessEvent {
  ts: string; service: "tlsd-ingress"; instance: string
  host: string; path: string; method: string; status: number
  source_ip: string; ja3: string; ja3_full: string; ja4: string
  latency_ms: number; bytes_out: number
  headers: Record<string, string>; headers_truncated: boolean
}

export function hasFingerprint(ja3: string, ja3_full: string, ja4: string): boolean {
  return Boolean(ja3 || ja3_full || ja4)
}

export function dailyIndex(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `subfrost-cdn-${y}.${m}.${day}`
}

export function buildAccessEvent(input: AccessEventInput, now: Date): AccessEvent {
  const headers: Record<string, string> = {
    sni: input.host,
    "user-agent": input.userAgent,
    "x-forwarded-for": input.xff,
  }
  if (input.referer) headers.referer = input.referer
  if (input.utm) for (const [k, v] of Object.entries(input.utm)) if (v) headers[k] = v
  return {
    ts: now.toISOString(),
    service: "tlsd-ingress",
    instance: input.instance,
    host: input.host,
    path: input.path,
    method: input.method,
    status: input.status,
    source_ip: input.sourceIp,
    ja3: input.ja3,
    ja3_full: input.ja3_full,
    ja4: input.ja4,
    latency_ms: input.latencyMs,
    bytes_out: 0,
    headers,
    headers_truncated: false,
  }
}

export async function emitAccessEvent(event: AccessEvent, esUrl: string = TELEMETRY_ES_URL): Promise<void> {
  const index = dailyIndex(new Date(event.ts))
  try {
    await fetch(`${esUrl}/${index}/_doc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(2500),
    })
  } catch {
    // best-effort beacon: swallow all errors (network, timeout, 4xx/5xx)
  }
}
