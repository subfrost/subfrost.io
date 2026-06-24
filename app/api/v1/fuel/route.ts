import { NextRequest, NextResponse } from "next/server"
import { audit } from "@/lib/cms/audit"
import { FuelError, listAllocations, upsertAllocations, type FuelEntry } from "@/lib/fuel/admin"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/fuel — list FUEL allocations (scope: fuel.read)
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "fuel.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => ok(await listAllocations()))
}

// POST /api/v1/fuel — upsert one or more allocations by address (scope: fuel.edit).
// Body: { entries: [{ address, amount, note? }, ...] }.
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "fuel.edit")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<{ entries?: FuelEntry[] }>(req)
    if (body instanceof NextResponse) return body
    const entries = Array.isArray(body.entries) ? body.entries : []
    try {
      const { count } = await upsertAllocations(entries)
      await audit("upsert_fuel", {
        actorId: actor.id,
        target: entries.length === 1 ? entries[0]?.address : `×${count}`,
      })
      return ok({ ok: true, count })
    } catch (e) {
      if (e instanceof FuelError) return fail(e.message, 400)
      throw e
    }
  })
}
