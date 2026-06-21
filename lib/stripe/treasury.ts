/** Treasury reads (FBO balances + transactions). Pure source passthrough; the ACH
 *  money-movement queue lives in lib/stripe/money.ts. Gated via actions/cms/billing.ts. */
import { isLive } from "@/lib/stripe/config"
import { getStripeSource } from "@/lib/stripe/source"
import type { TreasuryBalance, TreasuryTransaction } from "@/lib/stripe/shapes"

export async function listBalances(): Promise<{ balances: TreasuryBalance[]; live: boolean }> {
  const live = isLive()
  return { balances: await getStripeSource().treasuryBalances(), live }
}

export async function listTransactions(): Promise<{ transactions: TreasuryTransaction[]; live: boolean }> {
  const live = isLive()
  return { transactions: await getStripeSource().treasuryTransactions(), live }
}
