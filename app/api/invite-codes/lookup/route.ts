/**
 * GET /api/invite-codes/lookup?address=<taproot> — most recent code an address
 * redeemed. Auth: X-API-Key (cross-service). → { found, code?, codeDescription?,
 * parentCode? }
 *
 * This is the endpoint `community-bridge` currently calls on app.subfrost.io;
 * the inversion makes subfrost.io the owner.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireServiceKey } from "@/lib/referral/auth"
import { lookupByAddress } from "@/lib/referral/codes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const denied = requireServiceKey(request)
  if (denied) return denied

  const address = request.nextUrl.searchParams.get("address")
  if (!address) {
    return NextResponse.json({ error: "address parameter required" }, { status: 400 })
  }

  return NextResponse.json(await lookupByAddress(address))
}
