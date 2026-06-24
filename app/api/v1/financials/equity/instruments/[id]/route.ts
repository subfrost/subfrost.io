import { NextRequest, NextResponse } from "next/server"
import { EquityError, updateInstrument, deleteInstrument, type InstrumentInput } from "@/lib/financials/equity/store"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

// PATCH /api/v1/financials/equity/instruments/:id — update a SAFE / token
// agreement. Mirrors updateInstrumentAction (audit: equity_instrument_update).
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await params
    const body = await readJson<Partial<InstrumentInput>>(req)
    if (body instanceof NextResponse) return body
    try {
      const value = await updateInstrument(id, body)
      await audit("equity_instrument_update", { actorId: actor.id, target: `${value.type}:${value.investorName}` })
      return ok(value)
    } catch (e) {
      if (e instanceof EquityError) return fail(e.message, 400)
      throw e
    }
  })
}

// DELETE /api/v1/financials/equity/instruments/:id — delete an instrument.
// Mirrors deleteInstrumentAction (audit: equity_instrument_delete).
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await params
    try {
      await deleteInstrument(id)
      await audit("equity_instrument_delete", { actorId: actor.id, target: id })
      return ok({ ok: true })
    } catch (e) {
      if (e instanceof EquityError) return fail(e.message, 400)
      throw e
    }
  })
}
