import { NextRequest, NextResponse } from "next/server"
import { BalanceSheetError, updateManualItem, deleteManualItem } from "@/lib/financials/balance-sheet/store"
import type { BalanceSheetSection } from "@/lib/financials/balance-sheet/shapes"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

// PATCH /api/v1/financials/balance-sheet/items/:id — update a manual line item.
// Mirrors updateBalanceSheetItemAction (audit: balance_sheet_item_upsert).
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await params
    const body = await readJson<{
      section?: BalanceSheetSection; label?: string; amountUsd?: number; sortOrder?: number; notes?: string | null
    }>(req)
    if (body instanceof NextResponse) return body
    try {
      const value = await updateManualItem(id, body)
      await audit("balance_sheet_item_upsert", { actorId: actor.id, target: `${value.section}:${value.label}` })
      return ok(value)
    } catch (e) {
      if (e instanceof BalanceSheetError) return fail(e.message, 400)
      throw e
    }
  })
}

// DELETE /api/v1/financials/balance-sheet/items/:id — delete a manual line item.
// Mirrors deleteBalanceSheetItemAction (audit: balance_sheet_item_delete).
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await params
    try {
      await deleteManualItem(id)
      await audit("balance_sheet_item_delete", { actorId: actor.id, target: id })
      return ok({ ok: true })
    } catch (e) {
      if (e instanceof BalanceSheetError) return fail(e.message, 400)
      throw e
    }
  })
}
