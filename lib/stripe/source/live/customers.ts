import { getStripeClient } from "@/lib/stripe/client"
import type {
  CustomerSummary, CustomerDetail, CustomerInvoice, CustomerCharge,
  CustomerPaymentMethod, CustomerSubscriptionRef,
} from "@/lib/stripe/shapes"

const iso = (sec: number | null | undefined) => (sec != null ? new Date(sec * 1000).toISOString() : null)
const sumSucceeded = (charges: any[]) =>
  charges.filter((c) => c.status === "succeeded").reduce((t, c) => t + (c.amount ?? 0), 0)

export async function liveCustomerSummaries(): Promise<CustomerSummary[]> {
  const stripe = getStripeClient()
  const res = await stripe.customers.list({ limit: 50, expand: ["data.subscriptions"] })
  const out: CustomerSummary[] = []
  for (const c of res.data as any[]) {
    const charges = await stripe.charges.list({ customer: c.id, limit: 100 })
    out.push({
      id: c.id,
      email: c.email ?? "",
      name: c.name ?? "",
      activeSubscriptions: (c.subscriptions?.data ?? []).filter((s: any) => s.status === "active").length,
      lifetimeValue: sumSucceeded(charges.data),
      createdAt: iso(c.created) ?? "",
    })
  }
  return out
}

export async function liveCustomerDetail(id: string): Promise<CustomerDetail | null> {
  const stripe = getStripeClient()
  const c: any = await stripe.customers.retrieve(id)
  if (!c || c.deleted) return null
  const [subs, invoices, pms, charges] = await Promise.all([
    stripe.subscriptions.list({ customer: id, status: "all", limit: 100, expand: ["data.items.data.price.product"] }),
    stripe.invoices.list({ customer: id, limit: 100 }),
    stripe.paymentMethods.list({ customer: id, type: "card", limit: 100 }),
    stripe.charges.list({ customer: id, limit: 100 }),
  ])
  const defaultPm = c.invoice_settings?.default_payment_method
  const subscriptions: CustomerSubscriptionRef[] = subs.data.map((s: any) => ({
    id: s.id, tier: s.items?.data?.[0]?.price?.product?.name ?? "", status: s.status,
    renewsAt: s.status === "canceled" ? null : iso(s.current_period_end),
  }))
  const inv: CustomerInvoice[] = invoices.data.map((i: any) => ({
    id: i.id, number: i.number ?? "", amountDue: i.amount_due ?? 0, status: i.status, createdAt: iso(i.created) ?? "",
  }))
  const paymentMethods: CustomerPaymentMethod[] = pms.data.map((m: any) => ({
    id: m.id, brand: m.card?.brand ?? "", last4: m.card?.last4 ?? "",
    expMonth: m.card?.exp_month ?? 0, expYear: m.card?.exp_year ?? 0, isDefault: m.id === defaultPm,
  }))
  const recentCharges: CustomerCharge[] = charges.data.slice(0, 10).map((ch: any) => ({
    id: ch.id, amount: ch.amount ?? 0,
    status: ch.refunded ? "refunded" : ch.status, description: ch.description ?? null, createdAt: iso(ch.created) ?? "",
  }))
  return { id: c.id, email: c.email ?? "", name: c.name ?? "", subscriptions, invoices: inv, paymentMethods, recentCharges }
}
