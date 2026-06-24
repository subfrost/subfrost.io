import { NextRequest, NextResponse } from "next/server"
import { loadCommunityData } from "@/lib/community/aggregate"
import { requireAnyScope, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/communities/:rootId — members + codes for one community
// (scope: referral.read OR fuel.read). FUEL is populated only with fuel.read.
export async function GET(req: NextRequest, ctx: { params: Promise<{ rootId: string }> }) {
  const actor = await requireAnyScope(req, ["referral.read", "fuel.read"])
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { rootId } = await ctx.params
    const canSeeFuel = actor.privileges.includes("fuel.read")
    const agg = await loadCommunityData(canSeeFuel)
    const c = agg.communities.find((x) => x.rootId === rootId)
    if (!c) return fail("Community not found", 404)
    return ok({ detail: { members: c.members, codes: c.codes } })
  })
}
