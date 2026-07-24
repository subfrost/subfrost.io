import { NextResponse } from "next/server"
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
  request: Request,
  expected: string | undefined,
  envName: string,
): NextResponse | null {
  return requireSharedSecret(request, "x-api-key", expected, envName)
}

/**
 * Guards a machine-to-machine admin endpoint with the shared `ADMIN_SECRET`
 * sent as `X-Admin-Secret`. Same contract as `requireApiKey` above, different
 * header + env var.
 *
 * 7-24 audit: every `/api/admin/*` and `/api/pager/*` route that reads this
 * header used to inline a plain `!==` string compare, unlike `requireApiKey`
 * which has always been constant-time. Routing them all through one helper
 * removes the inconsistency and makes the next such route correct by default.
 */
export function requireAdminSecret(request: Request): NextResponse | null {
  return requireSharedSecret(request, "x-admin-secret", process.env.ADMIN_SECRET, "ADMIN_SECRET")
}

/**
 * Shared implementation: read `headerName`, compare it to `expected` in
 * constant time, and short-circuit with a NextResponse on failure.
 *
 * Returns null when authorized, otherwise:
 *  - 503 when `expected` is unset/empty (misconfiguration, not the caller's fault)
 *  - 401 when the header is missing or does not match
 */
function requireSharedSecret(
  request: Request,
  headerName: string,
  expected: string | undefined,
  envName: string,
): NextResponse | null {
  if (!expected) {
    return NextResponse.json({ error: `${envName} not configured` }, { status: 503 })
  }
  const provided = request.headers.get(headerName) ?? ""
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
