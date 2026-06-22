import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/stripe/source/live/identity", () => ({ liveIdentityVerification: vi.fn() }))
vi.mock("@/lib/kyc/sync", () => ({ upsertIdentityIntake: vi.fn() }))

import { onIdentityEvent } from "@/lib/stripe/webhooks/handlers/identity"
import { liveIdentityVerification } from "@/lib/stripe/source/live/identity"
import { upsertIdentityIntake } from "@/lib/kyc/sync"
import type Stripe from "stripe"
import type { StripeIdentityVerification } from "@/lib/stripe/shapes"

const event = (id: string): Stripe.Event =>
  ({ id: "evt_1", type: "identity.verification_session.verified", data: { object: { id } } } as unknown as Stripe.Event)

const verification: StripeIdentityVerification = {
  id: "vs_1", verdict: "verified", lastError: null,
  document: { type: "passport", country: "US" },
  extracted: { firstName: "Ada", lastName: "Lovelace", dob: "1815-12-10" },
  email: "ada@x.io", createdAt: "2026-06-21T00:00:00.000Z",
}

beforeEach(() => vi.clearAllMocks())

describe("onIdentityEvent", () => {
  it("fetches the session and upserts the intake", async () => {
    vi.mocked(liveIdentityVerification).mockResolvedValueOnce(verification)
    await onIdentityEvent(event("vs_1"))
    expect(liveIdentityVerification).toHaveBeenCalledWith("vs_1")
    expect(upsertIdentityIntake).toHaveBeenCalledWith(expect.objectContaining({ externalId: "vs_1", status: "PENDING", riskScore: "LOW" }))
  })

  it("no-ops when the source degrades (returns null)", async () => {
    vi.mocked(liveIdentityVerification).mockResolvedValueOnce(null)
    await onIdentityEvent(event("vs_1"))
    expect(upsertIdentityIntake).not.toHaveBeenCalled()
  })

  it("no-ops (no throw) when the source throws", async () => {
    vi.mocked(liveIdentityVerification).mockRejectedValueOnce(new Error("not enabled"))
    await expect(onIdentityEvent(event("vs_1"))).resolves.toBeUndefined()
    expect(upsertIdentityIntake).not.toHaveBeenCalled()
  })

  it("no-ops when the event has no object id", async () => {
    await onIdentityEvent({ id: "evt_1", type: "identity.verification_session.verified", data: { object: {} } } as unknown as Stripe.Event)
    expect(liveIdentityVerification).not.toHaveBeenCalled()
  })
})
