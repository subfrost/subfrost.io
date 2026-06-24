import { NextRequest, NextResponse } from "next/server"
import { listBalances } from "@/lib/stripe/treasury"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/billing/balances — list treasury balances (scope: billing.read)
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "billing.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { balances, live } = await listBalances()
    return ok({ count: balances.length, balances, live })
  })
}
