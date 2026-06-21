/** Issuing surface (cards + disputes). Reads come from getStripeSource(); in seed mode
 *  the StripeCardControl / StripeDisputeEvidence overlays are layered on so the demo is
 *  interactive. Mutations are low-risk hybrid: live → Stripe (stubbed today); seed → overlay. */
import prisma from "@/lib/prisma"
import { isLive, BillingError, StripeNotWiredError } from "@/lib/stripe/config"
import { getStripeSource } from "@/lib/stripe/source"
import { CardControlSchema, DisputeEvidenceSchema, type IssuingCard, type IssuingDispute } from "@/lib/stripe/shapes"

export async function listCards(): Promise<{ cards: IssuingCard[]; live: boolean }> {
  const live = isLive()
  const cards = await getStripeSource().issuingCards()
  if (live) return { cards, live }
  const controls = await prisma.stripeCardControl.findMany()
  const byCard = new Map(controls.map((c) => [c.cardId, c.state]))
  const applied = cards.map((c) =>
    byCard.has(c.id) ? { ...c, state: byCard.get(c.id) as IssuingCard["state"] } : c,
  )
  return { cards: applied, live }
}

export async function listDisputes(): Promise<{ disputes: IssuingDispute[]; live: boolean }> {
  const live = isLive()
  const disputes = await getStripeSource().issuingDisputes()
  if (live) return { disputes, live }
  const rows = await prisma.stripeDisputeEvidence.findMany({ orderBy: { at: "desc" } })
  const byDispute = new Map<string, { evidence: string | null; evidenceFiles: string[] }>()
  for (const e of rows) if (!byDispute.has(e.disputeId)) byDispute.set(e.disputeId, { evidence: e.evidence, evidenceFiles: e.evidenceFiles })
  const applied = disputes.map((d) => {
    const e = byDispute.get(d.id)
    return e ? { ...d, evidence: e.evidence ?? undefined, evidenceFiles: e.evidenceFiles } : d
  })
  return { disputes: applied, live }
}

export async function setCardControl(cardId: string, input: unknown, by: string): Promise<{ cardId: string; state: string }> {
  const res = CardControlSchema.safeParse(input)
  if (!res.success) throw new BillingError("Validation failed: " + JSON.stringify(res.error.issues))
  if (isLive()) throw new StripeNotWiredError("setCardControl")
  const saved = await prisma.stripeCardControl.upsert({
    where: { cardId },
    create: { cardId, state: res.data.state, by },
    update: { state: res.data.state, by },
  })
  return { cardId: saved.cardId, state: saved.state }
}

export async function submitDisputeEvidence(disputeId: string, input: unknown, by: string): Promise<{ disputeId: string }> {
  const res = DisputeEvidenceSchema.safeParse(input)
  if (!res.success) throw new BillingError("Validation failed: " + JSON.stringify(res.error.issues))
  if (isLive()) throw new StripeNotWiredError("submitDisputeEvidence")
  await prisma.stripeDisputeEvidence.create({
    data: { disputeId, evidence: res.data.evidence, evidenceFiles: res.data.evidenceFiles ?? [], by },
  })
  return { disputeId }
}
