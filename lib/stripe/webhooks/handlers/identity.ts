import type Stripe from "stripe"
import { degradeIfUnavailable } from "@/lib/stripe/source/live/degrade"
import { liveIdentityVerification } from "@/lib/stripe/source/live/identity"
import { mapIdentityVerification } from "@/lib/kyc/identity-map"
import { upsertIdentityIntake } from "@/lib/kyc/sync"

/** Handle an identity.verification_session.* event: fetch the session (report
 *  expanded, no images), map it, and upsert the KycIntake. Degrades to a no-op if
 *  Identity is unavailable — the event row still records receipt, and the manual
 *  SP-2 sync remains the fallback. */
export async function onIdentityEvent(event: Stripe.Event): Promise<void> {
  const id = (event.data.object as { id?: string }).id
  if (!id) return
  const v = await degradeIfUnavailable(() => liveIdentityVerification(id), null)
  if (!v) return
  await upsertIdentityIntake(mapIdentityVerification(v))
}
