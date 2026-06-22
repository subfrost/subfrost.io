"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import type { Privilege } from "@/lib/cms/privileges"
import { audit } from "@/lib/cms/audit"
import { BillingError, StripeNotWiredError, isLive } from "@/lib/stripe/config"
import { listApplications, upsertApplication, type ApplicationRow } from "@/lib/stripe/applications"
import { changeSubscription, listSubscribers, listTiers } from "@/lib/stripe/subscriptions"
import { createPromoCode, listPromoCodes } from "@/lib/stripe/promo"
import { listIntents, queueAchTransfer, confirmIntent, cancelIntent, queueRefund, type MoneyIntentRow } from "@/lib/stripe/money"
import { listBalances, listTransactions } from "@/lib/stripe/treasury"
import { listSettlements } from "@/lib/stripe/offramp"
import { listOnrampSessions } from "@/lib/stripe/onramp"
import { listCards, listDisputes, setCardControl, submitDisputeEvidence } from "@/lib/stripe/issuing"
import type { SubscriptionTier, Subscriber, PromoCode, TreasuryBalance, TreasuryTransaction, IssuingCard, IssuingDispute, OfframpSettlement, CustomerSummary, CustomerDetail, OnrampSession, OnrampMetrics, OnrampPeriod } from "@/lib/stripe/shapes"
import { listCustomers, getCustomer } from "@/lib/stripe/customers"
import { listWebhookEvents } from "@/lib/stripe/webhooks/store"
import type { WebhookEventRow } from "@/lib/stripe/shapes"

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

async function actor(
  required: Privilege,
): Promise<{ ok: true; me: CmsUser } | { ok: false; error: string }> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  if (!me.privileges.includes(required)) return { ok: false, error: "Insufficient privileges" }
  return { ok: true, me }
}

export async function listApplicationsAction(): Promise<
  { ok: true; applications: ApplicationRow[] } | { ok: false; error: string }
> {
  const a = await actor("BILLING_VIEW")
  if (!a.ok) return a
  return { ok: true, applications: await listApplications() }
}

export async function upsertApplicationAction(
  product: string,
  input: { status: string; notes?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor("BILLING_EDIT")
  if (!a.ok) return a
  try {
    await upsertApplication(product, input, a.me.email)
    await audit("stripe_application_update", { actorId: a.me.id, target: product, ip: await ip() })
    revalidatePath("/admin/billing/applications")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError) return { ok: false, error: e.message }
    throw e
  }
}

export async function listTiersAction(): Promise<
  { ok: true; tiers: SubscriptionTier[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor("BILLING_VIEW")
  if (!a.ok) return a
  const { tiers, live } = await listTiers()
  return { ok: true, tiers, live }
}

export async function listSubscribersAction(): Promise<
  { ok: true; subscribers: Subscriber[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor("BILLING_VIEW")
  if (!a.ok) return a
  const { subscribers, live } = await listSubscribers()
  return { ok: true, subscribers, live }
}

export async function changeSubscriptionAction(
  subscriptionId: string,
  input: { action: string; note?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor("BILLING_EDIT")
  if (!a.ok) return a
  try {
    await changeSubscription(subscriptionId, input, a.me.email)
    await audit("stripe_subscription_action", { actorId: a.me.id, target: subscriptionId, ip: await ip() })
    revalidatePath("/admin/billing/subscriptions")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}

export async function listPromoCodesAction(): Promise<
  { ok: true; codes: PromoCode[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor("BILLING_VIEW")
  if (!a.ok) return a
  const { codes, live } = await listPromoCodes()
  return { ok: true, codes, live }
}

export async function createPromoCodeAction(
  input: { code: string; type: string; value: number; maxRedemptions?: number; expiresAt?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor("BILLING_EDIT")
  if (!a.ok) return a
  try {
    const created = await createPromoCode(input, a.me.email)
    await audit("stripe_promo_create", { actorId: a.me.id, target: created.code, ip: await ip() })
    revalidatePath("/admin/billing/promo")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}

export async function listBalancesAction(): Promise<
  { ok: true; balances: TreasuryBalance[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor("BILLING_VIEW")
  if (!a.ok) return a
  const { balances, live } = await listBalances()
  return { ok: true, balances, live }
}

export async function listTransactionsAction(): Promise<
  { ok: true; transactions: TreasuryTransaction[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor("BILLING_VIEW")
  if (!a.ok) return a
  const { transactions, live } = await listTransactions()
  return { ok: true, transactions, live }
}

export async function listMoneyIntentsAction(): Promise<
  { ok: true; intents: MoneyIntentRow[] } | { ok: false; error: string }
> {
  const a = await actor("BILLING_VIEW")
  if (!a.ok) return a
  return { ok: true, intents: await listIntents("ACH_TRANSFER") }
}

export async function queueAchTransferAction(
  input: { direction: string; amount: number; counterparty: string; memo?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor("BILLING_EDIT")
  if (!a.ok) return a
  try {
    await queueAchTransfer(input, a.me.email)
    await audit("stripe_money_queue", { actorId: a.me.id, target: `${input.direction} ${input.amount}`, ip: await ip() })
    revalidatePath("/admin/billing/treasury")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}

export async function confirmIntentAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor("BILLING_EDIT")
  if (!a.ok) return a
  try {
    await confirmIntent(id, a.me.email)
    await audit("stripe_money_confirm", { actorId: a.me.id, target: id, ip: await ip() })
    revalidatePath("/admin/billing/treasury")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}

export async function cancelIntentAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor("BILLING_EDIT")
  if (!a.ok) return a
  try {
    await cancelIntent(id, a.me.email)
    await audit("stripe_money_cancel", { actorId: a.me.id, target: id, ip: await ip() })
    revalidatePath("/admin/billing/treasury")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}

export async function listCardsAction(): Promise<
  { ok: true; cards: IssuingCard[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor("BILLING_VIEW")
  if (!a.ok) return a
  const { cards, live } = await listCards()
  return { ok: true, cards, live }
}

export async function listDisputesAction(): Promise<
  { ok: true; disputes: IssuingDispute[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor("BILLING_VIEW")
  if (!a.ok) return a
  const { disputes, live } = await listDisputes()
  return { ok: true, disputes, live }
}

export async function setCardControlAction(
  cardId: string,
  input: { state: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor("BILLING_EDIT")
  if (!a.ok) return a
  try {
    await setCardControl(cardId, input, a.me.email)
    await audit("stripe_card_control", { actorId: a.me.id, target: cardId, ip: await ip() })
    revalidatePath("/admin/billing/issuing")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}

export async function submitDisputeEvidenceAction(
  disputeId: string,
  input: { evidence: string; evidenceFiles?: string[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor("BILLING_EDIT")
  if (!a.ok) return a
  try {
    await submitDisputeEvidence(disputeId, input, a.me.email)
    await audit("stripe_dispute_evidence", { actorId: a.me.id, target: disputeId, ip: await ip() })
    revalidatePath("/admin/billing/issuing")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}

export async function listSettlementsAction(): Promise<
  { ok: true; settlements: OfframpSettlement[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor("BILLING_VIEW")
  if (!a.ok) return a
  const { settlements, live } = await listSettlements()
  return { ok: true, settlements, live }
}

export async function listCustomersAction(): Promise<
  { ok: true; customers: CustomerSummary[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor("BILLING_VIEW")
  if (!a.ok) return a
  const { customers, live } = await listCustomers()
  return { ok: true, customers, live }
}

export async function getCustomerAction(id: string): Promise<
  { ok: true; customer: CustomerDetail | null; live: boolean } | { ok: false; error: string }
> {
  const a = await actor("BILLING_VIEW")
  if (!a.ok) return a
  const { customer, live } = await getCustomer(id)
  return { ok: true, customer, live }
}

export async function listRefundIntentsAction(): Promise<
  { ok: true; intents: MoneyIntentRow[] } | { ok: false; error: string }
> {
  const a = await actor("BILLING_VIEW")
  if (!a.ok) return a
  return { ok: true, intents: await listIntents("REFUND") }
}

export async function requestRefundAction(
  input: { reference: string; amount: number; reason?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor("BILLING_EDIT")
  if (!a.ok) return a
  try {
    await queueRefund(input, a.me.email)
    await audit("stripe_refund_request", { actorId: a.me.id, target: input.reference, ip: await ip() })
    revalidatePath("/admin/billing/customers")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}

export async function listOnrampSessionsAction(
  period: OnrampPeriod = "30d",
): Promise<
  { ok: true; sessions: OnrampSession[]; metrics: OnrampMetrics; live: boolean } | { ok: false; error: string }
> {
  const a = await actor("BILLING_VIEW")
  if (!a.ok) return a
  const { sessions, metrics, live } = await listOnrampSessions(period)
  return { ok: true, sessions, metrics, live }
}

export async function listWebhookEventsAction(
  filter?: { type?: string; status?: string },
): Promise<{ ok: true; events: WebhookEventRow[]; live: boolean } | { ok: false; error: string }> {
  const a = await actor("BILLING_VIEW")
  if (!a.ok) return a
  return { ok: true, events: await listWebhookEvents(filter), live: isLive() }
}
