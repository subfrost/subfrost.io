import { NextRequest, NextResponse } from "next/server"
import { listCustomers } from "@/lib/stripe/customers"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/billing/customers — list customers (scope: billing.read)
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "billing.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { customers, live } = await listCustomers()
    return ok({ count: customers.length, customers, live })
  })
}
