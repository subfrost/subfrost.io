import { NextRequest, NextResponse } from "next/server"
import { listInvoices, listPayees, listPayments } from "@/lib/financials/accounting/store"
import { summaryMetrics } from "@/lib/financials/accounting/shapes"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/financials/accounting — accounting overview (scope: financials.view).
// Mirrors accountingOverviewAction: payees, invoices, payments + summary metrics.
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const [payees, invoices, payments] = await Promise.all([
      listPayees(), listInvoices(), listPayments(),
    ])
    return ok({ payees, invoices, payments, metrics: summaryMetrics(invoices, payments) })
  })
}
