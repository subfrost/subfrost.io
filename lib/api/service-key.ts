import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"

/**
 * Guards a cross-service API with a shared static secret sent as `X-API-Key`.
 * `expected` is the configured secret (e.g. process.env.FUEL_API_KEY); `envName`
 * is its variable name, used only in the "not configured" message.
 *
 * Returns a NextResponse to short-circuit on failure, or null when authorized:
 *  - 503 when `expected` is unset/empty (misconfiguration, not the caller's fault)
 *  - 401 when the `x-api-key` header is missing or does not match
 */
export function requireApiKey(
  request: NextRequest,
  expected: string | undefined,
  envName: string,
): NextResponse | null {
  if (!expected) {
    return NextResponse.json({ error: `${envName} not configured` }, { status: 503 })
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
