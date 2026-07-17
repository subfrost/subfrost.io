// app/api/fp/route.ts
// TLS-fingerprint beacon. Reads the tlsd-injected X-TLS-* headers, writes a
// subfrost-cdn-* access event (shared shaping in lib/telemetry/access-event),
// and returns the fingerprint as JSON. Drop-in for the old /upgrade beacon.
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import os from "os"
import { buildAccessEvent, emitAccessEvent, hasFingerprint } from "@/lib/telemetry/access-event"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clientIp(h: Headers): string {
  const xff = h.get("x-forwarded-for")
  if (xff) { const first = xff.split(",")[0]?.trim(); if (first) return first }
  return h.get("x-real-ip") || ""
}

export async function GET() {
  const start = Date.now()
  const h = await headers()
  const ja4 = h.get("x-tls-ja4") || ""
  const ja3_full = h.get("x-tls-ja3") || ""
  const ja3 = h.get("x-tls-ja3-hash") || ""
  const fingerprint = { ja3, ja3_full, ja4 }

  if (!hasFingerprint(ja3, ja3_full, ja4)) {
    return NextResponse.json({ fingerprint, captured: false }, { headers: { "cache-control": "no-store" } })
  }

  const event = buildAccessEvent({
    ja3, ja3_full, ja4,
    host: h.get("host") || "subfrost.io",
    path: "/api/fp", method: "GET", status: 200,
    sourceIp: clientIp(h),
    userAgent: h.get("user-agent") || "",
    xff: h.get("x-forwarded-for") || "",
    instance: os.hostname(),
    latencyMs: Date.now() - start,
  }, new Date())

  void emitAccessEvent(event)
  return NextResponse.json({ fingerprint, captured: true }, { headers: { "cache-control": "no-store" } })
}
