import { NextRequest, NextResponse } from "next/server"
import { listInvoices, listPayees, listPayments } from "@/lib/financials/accounting/store"
import { toCsv } from "@/lib/financials/accounting/shapes"
import { requireScope, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/financials/accounting/ledger.csv — DIESEL ledger CSV export
// (scope: financials.view). Mirrors exportLedgerCsvAction, returning the raw
// CSV string with text/csv content-type rather than the JSON envelope.
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const [payees, invoices, payments] = await Promise.all([
      listPayees(), listInvoices(), listPayments(),
    ])
    const csv = toCsv(invoices, payments, payees)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="diesel-ledger.csv"',
      },
    })
  })
}
