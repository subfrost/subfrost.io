import { NextRequest, NextResponse } from "next/server"
import { getCustomer } from "@/lib/stripe/customers"
import { requireScope, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/billing/customers/[id] — fetch one customer (scope: billing.read)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "billing.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await params
    const { customer, live } = await getCustomer(id)
    if (!customer) return fail("Customer not found", 404)
    return ok({ customer, live })
  })
}
