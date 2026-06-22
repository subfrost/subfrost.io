/** On-ramp (Stripe Crypto On-ramp) read surface. Pure metrics here; the
 *  source-backed list is added in a later task. Read-only observability (SP-3).
 *  Mirrors lib/stripe/offramp.ts but computes metrics over the loaded window. */
import {
  ONRAMP_STATUSES,
  type OnrampMetrics,
  type OnrampSession,
  type OnrampStatus,
} from "@/lib/stripe/shapes"

export function computeOnrampMetrics(sessions: OnrampSession[]): OnrampMetrics {
  const byStatus = Object.fromEntries(
    ONRAMP_STATUSES.map((st) => [st, 0]),
  ) as Record<OnrampStatus, number>
  const cryptoVolumeByAsset: Record<string, number> = {}
  let fiatVolume = 0
  let totalFees = 0

  for (const s of sessions) {
    byStatus[s.status] += 1
    if (s.status === "fulfillment_complete") {
      fiatVolume += s.sourceAmount
      totalFees += (s.transactionFee ?? 0) + (s.networkFee ?? 0)
      if (s.destAmount != null) {
        cryptoVolumeByAsset[s.destCurrency] =
          (cryptoVolumeByAsset[s.destCurrency] ?? 0) + s.destAmount
      }
    }
  }

  const total = sessions.length
  const completed = byStatus.fulfillment_complete
  return {
    total,
    byStatus,
    completed,
    conversionRate: total === 0 ? 0 : completed / total,
    fiatVolume,
    cryptoVolumeByAsset,
    totalFees,
  }
}
