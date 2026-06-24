import { NextRequest, NextResponse } from "next/server"
import { loadCommunityData, toOverview } from "@/lib/community/aggregate"
import { requireAnyScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/communities — community overview (scope: referral.read OR fuel.read).
// FUEL figures are populated only when the key holds fuel.read.
export async function GET(req: NextRequest) {
  const actor = await requireAnyScope(req, ["referral.read", "fuel.read"])
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const canSeeFuel = actor.privileges.includes("fuel.read")
    const agg = await loadCommunityData(canSeeFuel)
    return ok({ overview: toOverview(agg), canSeeFuel })
  })
}
