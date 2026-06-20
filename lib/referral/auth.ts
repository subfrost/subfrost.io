import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"

/**
 * Guards the cross-service referral API with a shared `X-API-Key`. subfrost.io
 * owns the referral graph; subfrost-app (and other internal services) call these
 * endpoints server-to-server with the shared `REFERRAL_API_KEY` secret. This is
 * the inversion of the old `community-bridge` direction (which called app.subfrost.io).
 *
 * Returns a NextResponse to short-circuit on failure, or null when authorized.
 */
export function requireServiceKey(request: NextRequest): NextResponse | null {
  const expected = process.env.REFERRAL_API_KEY
  if (!expected) {
    return NextResponse.json({ error: "REFERRAL_API_KEY not configured" }, { status: 503 })
  }
  const provided = request.headers.get("x-api-key") ?? ""
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

// Constant-time comparison; bails on length mismatch (timingSafeEqual throws otherwise).
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
