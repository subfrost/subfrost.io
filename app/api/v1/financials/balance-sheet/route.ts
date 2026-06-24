import { NextRequest, NextResponse } from "next/server"
import { buildBalanceSheet } from "@/lib/financials/balance-sheet/store"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/financials/balance-sheet — balance sheet view (scope: financials.view).
// Mirrors balanceSheetOverviewAction.
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const view = await buildBalanceSheet()
    return ok(view)
  })
}
