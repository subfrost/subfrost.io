// app/api/fp/route.ts
//
// TLS-fingerprint beacon + telemetry emitter.
//
// tlsd (the JA4 ingress in k8s/tlsd-ingress) terminates TLS for subfrost.io,
// computes the client's TLS fingerprints, and injects them as request headers
// before proxying to this Next.js app:
//   X-TLS-JA4       full JA4 string        (e.g. t13d1516h2_8daaf6152771_02713d6af862)
//   X-TLS-JA3       full JA3 string        (e.g. 772,4865-...,51-27-...,29-23-24,0)
//   X-TLS-JA3-Hash  JA3 md5 hash           (e.g. 28eba3f431789c89d53ba5aef7d47481)
//
// This route reads those headers, shapes a per-request access event matching the
// re-indexed `subfrost-cdn-<date>` documents in the new telemetry Elasticsearch,
// fire-and-forgets it into today's `subfrost-cdn-YYYY.MM.DD` index, and returns
// the fingerprint to the caller as JSON. That return payload makes it a drop-in
// replacement for the old x.subfrost.io `/upgrade` beacon (which fp-server used
// to serve): a page/SDK can GET /api/fp purely to have its fingerprint captured.
//
// Best-effort by design: if the tlsd headers are absent (local dev, or a request
// that didn't traverse tlsd) it gracefully no-ops the ES write and still returns
// 200. The ES POST never blocks or fails the response.

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import os from "os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ES_URL = (
  process.env.TELEMETRY_ES_URL ||
  "http://elasticsearch.telemetry.svc.cluster.local:9200"
).replace(/\/$/, "");

// Daily index name matching the re-indexed pattern: subfrost-cdn-2026.06.24
function dailyIndex(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `subfrost-cdn-${y}.${m}.${day}`;
}

// Event shape mirrors the strict (dynamic=strict) top-level mapping in
// k8s/telemetry/index-template-configmap.yaml. Extra/missing top-level fields
// are rejected by ES, so this set must match exactly. `headers` is a
// dynamic=true nested object (NOT a JSON string), as in the re-indexed docs.
interface FingerprintEvent {
  ts: string;
  service: "tlsd-ingress";
  instance: string;
  host: string;
  path: string;
  method: string;
  status: number;
  source_ip: string;
  ja3: string; // ja3 md5 hash
  ja3_full: string; // full ja3 string
  ja4: string; // ja4 string
  latency_ms: number;
  bytes_out: number;
  headers: Record<string, string>;
  headers_truncated: boolean;
}

// Pull the first hop from x-forwarded-for, falling back to x-real-ip.
function clientIp(h: Headers): string {
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") || "";
}

async function emitToEs(event: FingerprintEvent): Promise<void> {
  const index = dailyIndex(new Date());
  try {
    await fetch(`${ES_URL}/${index}/_doc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      // Short budget — this is a beacon, never let it stall the response.
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // Best-effort: swallow all ES errors (network, timeout, 4xx/5xx).
  }
}

export async function GET() {
  const start = Date.now();
  const h = await headers();

  const ja4 = h.get("x-tls-ja4") || "";
  const ja3_full = h.get("x-tls-ja3") || "";
  const ja3 = h.get("x-tls-ja3-hash") || "";

  const fingerprint = { ja3, ja3_full, ja4 };

  // No tlsd-injected fingerprint => request didn't traverse tlsd (e.g. local
  // dev, or a direct-to-Service call). Return the (empty) fingerprint without
  // writing to ES so dev never errors and we don't index junk docs.
  if (!ja4 && !ja3_full && !ja3) {
    return NextResponse.json(
      { fingerprint, captured: false },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const host = h.get("host") || "subfrost.io";
  const sourceIp = clientIp(h);
  const userAgent = h.get("user-agent") || "";

  const event: FingerprintEvent = {
    ts: new Date().toISOString(),
    service: "tlsd-ingress",
    instance: os.hostname(),
    host,
    path: "/api/fp",
    method: "GET",
    status: 200,
    source_ip: sourceIp,
    ja3,
    ja3_full,
    ja4,
    latency_ms: Date.now() - start,
    bytes_out: 0,
    // headers.* is dynamic=true; populate the same context keys the fp-server
    // docs carry (sni from Host, the forwarded UA + client-ip chain).
    headers: {
      sni: host,
      "user-agent": userAgent,
      "x-forwarded-for": h.get("x-forwarded-for") || "",
    },
    headers_truncated: false,
  };

  // Fire-and-forget: do not await, so the beacon response returns immediately.
  void emitToEs(event);

  return NextResponse.json(
    { fingerprint, captured: true },
    { headers: { "cache-control": "no-store" } },
  );
}
