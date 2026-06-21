/** Money-movement guardrail for the Stripe console. Reached through actions/cms/billing.ts
 *  (gated MANAGE_BILLING). Used by Treasury (ACH) and, in D4, Customers (refunds). Money
 *  movement NEVER auto-executes: it is queued as a StripeMoneyIntent and requires an explicit
 *  confirm. Queue + cancel are local in both modes; confirm executes the live Stripe transfer
 *  (stubbed today) — in seed mode it just marks the intent CONFIRMED for the demo. */
import prisma from "@/lib/prisma"
import { isLive, BillingError, StripeNotWiredError } from "@/lib/stripe/config"
import { QueueTransferSchema } from "@/lib/stripe/shapes"

export interface MoneyIntentRow {
  id: string
  kind: string
  direction: string | null
  amount: number
  counterparty: string | null
  reference: string | null
  memo: string | null
  status: string
  requestedBy: string
  requestedAt: string
  decidedBy: string | null
  decidedAt: string | null
}

type DbIntent = {
  id: string; kind: string; direction: string | null; amount: number
  counterparty: string | null; reference: string | null; memo: string | null
  status: string; requestedBy: string; requestedAt: Date; decidedBy: string | null; decidedAt: Date | null
}
const map = (r: DbIntent): MoneyIntentRow => ({
  id: r.id, kind: r.kind, direction: r.direction, amount: r.amount,
  counterparty: r.counterparty, reference: r.reference, memo: r.memo, status: r.status,
  requestedBy: r.requestedBy, requestedAt: r.requestedAt.toISOString(),
  decidedBy: r.decidedBy, decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
})

export async function listIntents(kind?: "ACH_TRANSFER" | "REFUND"): Promise<MoneyIntentRow[]> {
  const rows = (await prisma.stripeMoneyIntent.findMany({
    where: kind ? { kind } : undefined,
    orderBy: { requestedAt: "desc" },
  })) as DbIntent[]
  return rows.map(map)
}

export async function queueAchTransfer(input: unknown, by: string): Promise<MoneyIntentRow> {
  const res = QueueTransferSchema.safeParse(input)
  if (!res.success) throw new BillingError("Validation failed: " + JSON.stringify(res.error.issues))
  const { direction, amount, counterparty, memo } = res.data
  const saved = (await prisma.stripeMoneyIntent.create({
    data: { kind: "ACH_TRANSFER", direction, amount, counterparty, memo: memo ?? null, status: "QUEUED", requestedBy: by },
  })) as DbIntent
  return map(saved)
}

async function loadQueued(id: string): Promise<void> {
  const intent = await prisma.stripeMoneyIntent.findUnique({ where: { id } })
  if (!intent || intent.status !== "QUEUED") throw new BillingError("Intent not found or not in QUEUED state")
}

export async function confirmIntent(id: string, by: string): Promise<MoneyIntentRow> {
  await loadQueued(id)
  if (isLive()) throw new StripeNotWiredError("confirmIntent")
  const updated = (await prisma.stripeMoneyIntent.update({
    where: { id }, data: { status: "CONFIRMED", decidedBy: by, decidedAt: new Date() },
  })) as DbIntent
  return map(updated)
}

export async function cancelIntent(id: string, by: string): Promise<MoneyIntentRow> {
  await loadQueued(id)
  const updated = (await prisma.stripeMoneyIntent.update({
    where: { id }, data: { status: "CANCELED", decidedBy: by, decidedAt: new Date() },
  })) as DbIntent
  return map(updated)
}
