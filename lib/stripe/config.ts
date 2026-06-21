/** Cross-cutting gating + errors for the Stripe billing console. Client-safe:
 *  only reads process.env inside isLive(). The live path is wired only when
 *  STRIPE_SECRET_KEY is present; until then the console runs on deterministic
 *  seed data (demo mode) behind a non-blocking banner. Mirrors the gated pattern
 *  of the F2 AML modules. */
export function isLive(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export const DEMO_REASON =
  "Stripe is not connected — showing demo data. Set STRIPE_SECRET_KEY to go live."

/** Thrown by the live source adapter until the real Stripe SDK calls are wired.
 *  isLive() is false until the key is set, so getStripeSource() returns the seed
 *  source and this is never hit at runtime today. */
export class StripeNotWiredError extends Error {
  constructor(method: string) {
    super(`Stripe live source not wired: ${method}. Set STRIPE_SECRET_KEY and implement live.ts.`)
    this.name = "StripeNotWiredError"
  }
}

/** Typed domain error for billing libs (validation / not-found / bad input).
 *  Actions map it to { ok:false, error } without auditing. */
export class BillingError extends Error {}
