/** Live Stripe Crypto On-ramp read. Server-only.
 *
 *  stripe-node v22 has NO `crypto` namespace at runtime (the old cast-to-any
 *  call threw and degradeIfUnavailable rendered the console permanently
 *  empty), so this hits the REST endpoint directly with the same preview
 *  version the mobile backend uses (crypto_onramp_beta=v2 — verified live
 *  2026-07-18 against the first real purchase).
 *
 *  Normalized to OnrampSession: fiat in CENTS (Stripe returns dollar-decimal
 *  strings here), crypto destAmount as a decimal number. Never returns raw
 *  API objects. */
import {
  ONRAMP_STATUSES,
  type OnrampPeriod,
  type OnrampSession,
  type OnrampStatus,
} from "@/lib/stripe/shapes"

const DAY_S = 24 * 3600
const ONRAMP_PREVIEW_VERSION = "2026-05-27.preview;crypto_onramp_beta=v2"

function createdGte(period: OnrampPeriod): number | undefined {
  if (period === "all") return undefined
  const days = period === "7d" ? 7 : 30
  return Math.floor(Date.now() / 1000) - days * DAY_S
}

function mapStatus(s: unknown): OnrampStatus {
  return (ONRAMP_STATUSES as string[]).includes(s as string) ? (s as OnrampStatus) : "initialized"
}

/** "10.00" | 10 | null → integer cents | null. */
function dollarsToCents(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

export async function liveOnrampSessions(period: OnrampPeriod = "30d"): Promise<OnrampSession[]> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return []
  const gte = createdGte(period)
  const qs = new URLSearchParams({ limit: "100" })
  if (gte !== undefined) qs.set("created[gte]", String(gte))
  const res = await fetch(`https://api.stripe.com/v1/crypto/onramp_sessions?${qs}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": ONRAMP_PREVIEW_VERSION,
    },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`onramp list ${res.status}`)
  const body = (await res.json()) as { data?: any[] }

  return (body.data ?? []).map((o: any): OnrampSession => {
    const td = o.transaction_details ?? {}
    const fees = td.fees ?? {}
    const destAmount = td.destination_amount != null ? Number(td.destination_amount) : null
    return {
      id: o.id,
      status: mapStatus(o.status),
      createdAt: new Date((o.created ?? 0) * 1000).toISOString(),
      sourceCurrency: String(td.source_currency ?? "usd").toUpperCase(),
      sourceAmount: dollarsToCents(td.source_amount) ?? 0,
      destCurrency: String(td.destination_currency ?? "").toUpperCase(),
      destAmount: destAmount != null && Number.isFinite(destAmount) ? destAmount : null,
      destNetwork: td.destination_network ?? "",
      walletAddress: td.wallet_address ?? "",
      transactionFee: dollarsToCents(fees.transaction_fee),
      networkFee: dollarsToCents(fees.network_fee),
      rejectionReason:
        o.status === "rejected" ? (td.rejection_reason ?? o.rejection_reason ?? "rejected") : null,
    }
  })
}
