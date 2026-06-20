/**
 * POST /api/invite-codes/redeem — record that an address redeemed a code.
 * Auth: X-API-Key (cross-service). Body: { code, taprootAddress, segwitAddress?,
 * taprootPubkey? }. → { success, error?, redemptionId? }
 *
 * Graph only: this records the redemption keyed by taproot address. Wallet-user
 * creation stays in subfrost-app.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireServiceKey } from "@/lib/referral/auth"
import { redeemCode } from "@/lib/referral/codes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const denied = requireServiceKey(request)
  if (denied) return denied

  let body: {
    code?: string
    taprootAddress?: string
    segwitAddress?: string
    taprootPubkey?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
  }
  if (!body.code?.trim()) {
    return NextResponse.json({ success: false, error: "Code is required" }, { status: 400 })
  }
  if (!body.taprootAddress) {
    return NextResponse.json({ success: false, error: "Taproot address is required" }, { status: 400 })
  }

  return NextResponse.json(
    await redeemCode({
      code: body.code,
      taprootAddress: body.taprootAddress,
      segwitAddress: body.segwitAddress,
      taprootPubkey: body.taprootPubkey,
    }),
  )
}
