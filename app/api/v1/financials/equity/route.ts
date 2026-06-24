import { NextRequest, NextResponse } from "next/server"
import {
  listShareClasses, listShareholders, listHoldings, listInstruments,
} from "@/lib/financials/equity/store"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/financials/equity — cap-table overview (scope: financials.view).
// Mirrors equityOverviewAction: share classes, shareholders, holdings, instruments.
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const [classes, shareholders, holdings, instruments] = await Promise.all([
      listShareClasses(), listShareholders(), listHoldings(), listInstruments(),
    ])
    return ok({ classes, shareholders, holdings, instruments })
  })
}
