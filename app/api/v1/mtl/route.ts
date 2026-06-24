import { NextRequest, NextResponse } from "next/server"
import { listEntries } from "@/lib/mtl/admin"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/mtl — list money transmitter licensing entries (scope: aml.read)
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "aml.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const entries = await listEntries()
    return ok({ count: entries.length, entries })
  })
}
