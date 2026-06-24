import { NextRequest, NextResponse } from "next/server"
import { getAnnotatedCodeTree } from "@/lib/referral/admin"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/codes/tree — annotated referral code tree (scope: referral.read).
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "referral.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => ok({ tree: await getAnnotatedCodeTree() }))
}
