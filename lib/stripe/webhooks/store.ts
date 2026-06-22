import type Stripe from "stripe"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import type { WebhookEventSummary, WebhookEventRow } from "@/lib/stripe/shapes"

/** Persist the event idempotently by event.id. Returns "replay" when it was already
 *  completed (processed/ignored) so the caller skips re-dispatch; "process" otherwise
 *  (new event → row created as "received"; a prior "failed" row → left as-is to retry). */
export async function recordEvent(event: Stripe.Event, summary: WebhookEventSummary): Promise<"process" | "replay"> {
  const existing = await prisma.stripeWebhookEvent.findUnique({ where: { id: event.id } })
  if (existing && (existing.status === "processed" || existing.status === "ignored")) return "replay"
  if (!existing) {
    try {
      await prisma.stripeWebhookEvent.create({
        data: {
          id: event.id,
          type: event.type,
          apiVersion: event.api_version ?? null,
          stripeCreated: new Date(event.created * 1000),
          status: "received",
          handled: false,
          objectType: summary.objectType,
          objectId: summary.objectId,
          objectStatus: summary.objectStatus,
          amount: summary.amount,
          currency: summary.currency,
          reason: summary.reason,
        },
      })
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") return "replay" // concurrent duplicate
      throw e
    }
  }
  return "process"
}

export const markProcessed = (id: string) =>
  prisma.stripeWebhookEvent.update({ where: { id }, data: { status: "processed", handled: true } })

export const markIgnored = (id: string) =>
  prisma.stripeWebhookEvent.update({ where: { id }, data: { status: "ignored", handled: false } })

export const markFailed = (id: string, error: string) =>
  prisma.stripeWebhookEvent.update({ where: { id }, data: { status: "failed", error } })

export async function listWebhookEvents(filter?: { type?: string; status?: string }): Promise<WebhookEventRow[]> {
  const where: Prisma.StripeWebhookEventWhereInput = {}
  if (filter?.type) where.type = { contains: filter.type }
  if (filter?.status) where.status = filter.status
  const rows = await prisma.stripeWebhookEvent.findMany({ where, orderBy: { receivedAt: "desc" }, take: 200 })
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    handled: r.handled,
    error: r.error,
    stripeCreated: r.stripeCreated.toISOString(),
    receivedAt: r.receivedAt.toISOString(),
    objectType: r.objectType,
    objectId: r.objectId,
    objectStatus: r.objectStatus,
    amount: r.amount,
    currency: r.currency,
    reason: r.reason,
  }))
}
