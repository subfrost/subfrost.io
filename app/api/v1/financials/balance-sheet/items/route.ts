import { NextRequest, NextResponse } from "next/server"
import { BalanceSheetError, createManualItem } from "@/lib/financials/balance-sheet/store"
import type { BalanceSheetSection } from "@/lib/financials/balance-sheet/shapes"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/v1/financials/balance-sheet/items — add a manual line item. Mirrors
// createBalanceSheetItemAction (audit: balance_sheet_item_upsert).
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<{
      section?: BalanceSheetSection; label?: string; amountUsd?: number; sortOrder?: number; notes?: string | null
    }>(req)
    if (body instanceof NextResponse) return body
    if (!body.section || !body.label || body.amountUsd == null) {
      return fail("section, label and amountUsd are required", 400)
    }
    try {
      const value = await createManualItem({
        section: body.section, label: body.label, amountUsd: body.amountUsd,
        sortOrder: body.sortOrder, notes: body.notes ?? null,
      })
      await audit("balance_sheet_item_upsert", { actorId: actor.id, target: `${value.section}:${value.label}` })
      return ok(value, 201)
    } catch (e) {
      if (e instanceof BalanceSheetError) return fail(e.message, 400)
      throw e
    }
  })
}
