/** Customers / billing-portal reads. Pure source passthrough; refunds go through
 *  lib/stripe/money.ts (queueRefund). Gated via actions/cms/billing.ts. */
import { isLive } from "@/lib/stripe/config"
import { getStripeSource } from "@/lib/stripe/source"
import type { CustomerSummary, CustomerDetail } from "@/lib/stripe/shapes"

export async function listCustomers(): Promise<{ customers: CustomerSummary[]; live: boolean }> {
  const live = isLive()
  return { customers: await getStripeSource().customerSummaries(), live }
}

export async function getCustomer(id: string): Promise<{ customer: CustomerDetail | null; live: boolean }> {
  const live = isLive()
  return { customer: await getStripeSource().customerDetail(id), live }
}
