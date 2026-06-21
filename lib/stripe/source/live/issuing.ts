import { getStripeClient } from "@/lib/stripe/client"
import type { IssuingCard, IssuingDispute } from "@/lib/stripe/shapes"

const CARD_STATE: Record<string, IssuingCard["state"]> = { active: "active", inactive: "paused", canceled: "canceled" }
const DISPUTE_STATUS: Record<string, IssuingDispute["status"]> = { submitted: "submitted", won: "won", lost: "lost", unsubmitted: "submitted", expired: "lost" }
const DISPUTE_REASON: Record<string, IssuingDispute["reason"]> = { fraudulent: "fraudulent", duplicate: "duplicate", service_not_received: "service_not_received" }

export async function liveIssuingCards(): Promise<IssuingCard[]> {
  const stripe = getStripeClient()
  const res = await (stripe as any).issuing.cards.list({ limit: 100 })
  return res.data.map((c: any) => ({
    id: c.id,
    last4: c.last4 ?? "",
    cardholder: c.cardholder?.name ?? "",
    type: c.type === "physical" ? "physical" : "virtual",
    state: CARD_STATE[c.status] ?? "canceled",
    wallet: { apple: Boolean(c.wallets?.apple_pay?.eligible), google: Boolean(c.wallets?.google_pay?.eligible) },
    spendLimit: c.spending_controls?.spending_limits?.[0]?.amount ?? 0,
    spentMtd: 0,
  }))
}

export async function liveIssuingDisputes(): Promise<IssuingDispute[]> {
  const stripe = getStripeClient()
  const res = await (stripe as any).issuing.disputes.list({ limit: 100 })
  return res.data.map((d: any) => ({
    id: d.id,
    cardId: d.transaction?.card ?? "",
    amount: d.amount ?? 0,
    reason: DISPUTE_REASON[d.evidence?.reason ?? d.reason] ?? "other",
    status: DISPUTE_STATUS[d.status] ?? "submitted",
    openedAt: new Date((d.created ?? 0) * 1000).toISOString(),
  }))
}
