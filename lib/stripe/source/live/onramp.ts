/** Live Stripe Crypto On-ramp read. Server-only (imports the SDK via getStripeClient).
 *  Field names follow the dahlia API; verify against the SDK during impl — any mismatch
 *  yields undefined → 0/null (not a crash), and degradeIfUnavailable catches outright
 *  failures (e.g. on-ramp not enabled on the account). Normalized to OnrampSession:
 *  fiat in cents, crypto destAmount as a decimal number. Never returns raw SDK objects. */
import { getStripeClient } from "@/lib/stripe/client"
import {
  ONRAMP_STATUSES,
  type OnrampPeriod,
  type OnrampSession,
  type OnrampStatus,
} from "@/lib/stripe/shapes"

const DAY_S = 24 * 3600

function createdGte(period: OnrampPeriod): number | undefined {
  if (period === "all") return undefined
  const days = period === "7d" ? 7 : 30
  return Math.floor(Date.now() / 1000) - days * DAY_S
}

function mapStatus(s: unknown): OnrampStatus {
  return (ONRAMP_STATUSES as string[]).includes(s as string) ? (s as OnrampStatus) : "initialized"
}

export async function liveOnrampSessions(period: OnrampPeriod = "30d"): Promise<OnrampSession[]> {
  const stripe = getStripeClient()
  const gte = createdGte(period)
  const params: Record<string, unknown> = { limit: 100 }
  if (gte !== undefined) params.created = { gte }
  // The crypto namespace is not in the SDK's typed surface in v22 — cast to any.
  const res = await (stripe as unknown as { crypto: { onrampSessions: { list: (p: unknown) => Promise<{ data: any[] }> } } })
    .crypto.onrampSessions.list(params)

  return res.data.map((o: any): OnrampSession => {
    const td = o.transaction_details ?? {}
    const fees = td.fees ?? {}
    const destAmount = td.destination_amount != null ? Number(td.destination_amount) : null
    return {
      id: o.id,
      status: mapStatus(o.status),
      createdAt: new Date((o.created ?? 0) * 1000).toISOString(),
      sourceCurrency: String(td.source_currency ?? "usd").toUpperCase(),
      sourceAmount: td.source_amount ?? 0,
      destCurrency: String(td.destination_currency ?? "").toUpperCase(),
      destAmount: destAmount != null && Number.isFinite(destAmount) ? destAmount : null,
      destNetwork: td.destination_network ?? "",
      walletAddress: td.wallet_address ?? "",
      transactionFee: fees.transaction_fee ?? null,
      networkFee: fees.network_fee ?? null,
      rejectionReason: o.status === "rejected" ? (td.rejection_reason ?? o.rejection_reason ?? "rejected") : null,
    }
  })
}
