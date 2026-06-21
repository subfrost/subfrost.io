/** Subscriptions surface of the Stripe console. Reached through actions/cms/billing.ts
 *  (gated MANAGE_BILLING). Reads come from getStripeSource(); in seed mode the
 *  recorded StripeSubscriptionAction overlays are layered onto subscriber status so
 *  the demo is interactive. Mutations are low-risk: live → Stripe (stubbed today);
 *  seed → overlay row. */
import prisma from "@/lib/prisma"
import { isLive, BillingError, StripeNotWiredError } from "@/lib/stripe/config"
import { getStripeSource } from "@/lib/stripe/source"
import { SubscriptionActionSchema, type SubscriptionTier, type Subscriber, type SubscriberStatus } from "@/lib/stripe/shapes"

export interface SubscriptionActionRow {
  id: string
  subscriptionId: string
  action: string
  note: string | null
  by: string
  at: string
}

type DbAction = { id: string; subscriptionId: string; action: string; note: string | null; by: string; at: Date }
const mapAction = (r: DbAction): SubscriptionActionRow => ({
  id: r.id, subscriptionId: r.subscriptionId, action: r.action, note: r.note, by: r.by, at: r.at.toISOString(),
})

export async function listTiers(): Promise<{ tiers: SubscriptionTier[]; live: boolean }> {
  const live = isLive()
  const tiers = await getStripeSource().subscriptionTiers()
  return { tiers, live }
}

export async function listSubscribers(): Promise<{ subscribers: Subscriber[]; live: boolean }> {
  const live = isLive()
  const subscribers = await getStripeSource().subscribers()
  if (live) return { subscribers, live }
  // seed mode: layer the latest action per subscription onto status
  const rows = (await prisma.stripeSubscriptionAction.findMany({ orderBy: { at: "desc" } })) as DbAction[]
  const latest = new Map<string, string>()
  for (const r of rows) if (!latest.has(r.subscriptionId)) latest.set(r.subscriptionId, r.action)
  const applied = subscribers.map((s) => {
    const action = latest.get(s.id)
    if (action === "cancel") return { ...s, status: "canceled" as SubscriberStatus }
    if (action === "resume") return { ...s, status: "active" as SubscriberStatus }
    return s
  })
  return { subscribers: applied, live }
}

export async function changeSubscription(subscriptionId: string, input: unknown, by: string): Promise<SubscriptionActionRow> {
  const res = SubscriptionActionSchema.safeParse(input)
  if (!res.success) throw new BillingError("Validation failed: " + JSON.stringify(res.error.issues))
  if (isLive()) throw new StripeNotWiredError("changeSubscription")
  const saved = (await prisma.stripeSubscriptionAction.create({
    data: { subscriptionId, action: res.data.action, note: res.data.note ?? null, by },
  })) as DbAction
  return mapAction(saved)
}
