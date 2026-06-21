/** Stripe product application/onboarding tracker. Pure Postgres (no Stripe API):
 *  tracks where treasury/issuing/offramp onboarding stands. Reached through
 *  actions/cms/billing.ts (gated MANAGE_BILLING). */
import prisma from "@/lib/prisma"
import { BillingError } from "@/lib/stripe/config"
import { ApplicationUpsertSchema, STRIPE_APPLICATION_PRODUCTS } from "@/lib/stripe/shapes"

export interface ApplicationRow {
  id: string
  product: string
  status: string
  notes: string | null
  updatedBy: string
  updatedAt: string
}

type DbRow = { id: string; product: string; status: string; notes: string | null; updatedBy: string; updatedAt: Date }
const map = (r: DbRow): ApplicationRow => ({
  id: r.id, product: r.product, status: r.status, notes: r.notes, updatedBy: r.updatedBy, updatedAt: r.updatedAt.toISOString(),
})

export async function listApplications(): Promise<ApplicationRow[]> {
  const rows = await prisma.stripeApplication.findMany({ orderBy: { product: "asc" } })
  return rows.map((r) => map(r as DbRow))
}

export async function upsertApplication(product: string, input: unknown, by: string): Promise<ApplicationRow> {
  if (!(STRIPE_APPLICATION_PRODUCTS as readonly string[]).includes(product)) {
    throw new BillingError(`Unknown product: ${product}`)
  }
  const res = ApplicationUpsertSchema.safeParse(input)
  if (!res.success) throw new BillingError("Validation failed: " + JSON.stringify(res.error.issues))
  const { status, notes } = res.data
  const saved = await prisma.stripeApplication.upsert({
    where: { product },
    create: { product, status, notes: notes ?? null, updatedBy: by },
    update: { status, notes: notes ?? null, updatedBy: by },
  })
  return map(saved as DbRow)
}
