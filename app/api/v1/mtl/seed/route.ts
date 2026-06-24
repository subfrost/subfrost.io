import { NextRequest, NextResponse } from "next/server"
import { seedStates, MtlError } from "@/lib/mtl/admin"
import { audit } from "@/lib/cms/audit"
import { requireScope, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null
}

// POST /api/v1/mtl/seed — seed the MTL state registry (scope: aml.edit)
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "aml.edit")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    try {
      const { created } = await seedStates()
      await audit("seed_mtl", { actorId: actor.id, target: null, ip: clientIp(req) })
      return ok({ created })
    } catch (e) {
      if (e instanceof MtlError) return fail(e.message, 400)
      throw e
    }
  })
}
