/**
 * POST /api/invite-codes/validate — is a code real and active?
 * Auth: X-API-Key (cross-service). Body: { code }. → { valid, error? }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireServiceKey } from "@/lib/referral/auth"
import { validateCode } from "@/lib/referral/codes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const denied = requireServiceKey(request)
  if (denied) return denied

  let body: { code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ valid: false, error: "Invalid JSON body" }, { status: 400 })
  }
  if (!body.code?.trim()) {
    return NextResponse.json({ valid: false, error: "Code is required" }, { status: 400 })
  }

  return NextResponse.json(await validateCode(body.code))
}
