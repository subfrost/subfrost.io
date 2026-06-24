import { NextRequest, NextResponse } from "next/server"
import { listTransactions } from "@/lib/stripe/treasury"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/billing/transactions — list treasury transactions (scope: billing.read)
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "billing.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { transactions, live } = await listTransactions()
    return ok({ count: transactions.length, transactions, live })
  })
}
