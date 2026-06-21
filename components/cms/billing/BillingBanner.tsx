import { DEMO_REASON } from "@/lib/stripe/config"

/** Non-blocking demo banner shown on Stripe-backed pages when not connected. */
export function BillingBanner({ live }: { live: boolean }) {
  if (live) return null
  return (
    <div className="mb-4 rounded-md border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-300">
      {DEMO_REASON}
    </div>
  )
}
