import { NextRequest, NextResponse } from "next/server"
import { EquityError, createInstrument, type InstrumentInput } from "@/lib/financials/equity/store"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/v1/financials/equity/instruments — create a SAFE / token agreement.
// Mirrors createInstrumentAction (audit: equity_instrument_create).
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<Partial<InstrumentInput>>(req)
    if (body instanceof NextResponse) return body
    if (!body.type || !body.investorName || body.amountUsd == null || !body.signedAt) {
      return fail("type, investorName, amountUsd and signedAt are required", 400)
    }
    try {
      const value = await createInstrument(body as InstrumentInput)
      await audit("equity_instrument_create", { actorId: actor.id, target: `${value.type}:${value.investorName}` })
      return ok(value, 201)
    } catch (e) {
      if (e instanceof EquityError) return fail(e.message, 400)
      throw e
    }
  })
}
