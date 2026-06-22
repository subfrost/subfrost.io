import { NextRequest, NextResponse } from "next/server"
import { requireApiKey } from "@/lib/api/service-key"

/**
 * Guards the cross-service referral API with a shared `X-API-Key`. subfrost.io
 * owns the referral graph; subfrost-app (and other internal services) call these
 * endpoints server-to-server with the shared `REFERRAL_API_KEY` secret.
 *
 * Delegates to the shared `requireApiKey` helper so the constant-time compare
 * lives in one place. Returns a NextResponse to short-circuit, or null when authorized.
 */
export function requireServiceKey(request: NextRequest): NextResponse | null {
  return requireApiKey(request, process.env.REFERRAL_API_KEY, "REFERRAL_API_KEY")
}
