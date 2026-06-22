import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/stripe/webhooks/handlers/identity", () => ({ onIdentityEvent: vi.fn() }))

import { dispatchEvent } from "@/lib/stripe/webhooks/dispatch"
import { onIdentityEvent } from "@/lib/stripe/webhooks/handlers/identity"
import type Stripe from "stripe"

const ev = (type: string): Stripe.Event => ({ id: "evt_1", type, data: { object: { id: "x" } } } as unknown as Stripe.Event)

beforeEach(() => vi.clearAllMocks())

describe("dispatchEvent", () => {
  it("routes identity.verification_session.* to the identity handler", async () => {
    const r = await dispatchEvent(ev("identity.verification_session.verified"))
    expect(onIdentityEvent).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ handled: true })
  })

  it("ignores unrelated types (log-only)", async () => {
    const r = await dispatchEvent(ev("charge.succeeded"))
    expect(onIdentityEvent).not.toHaveBeenCalled()
    expect(r).toEqual({ handled: false })
  })

  it("propagates a handler error", async () => {
    vi.mocked(onIdentityEvent).mockRejectedValueOnce(new Error("boom"))
    await expect(dispatchEvent(ev("identity.verification_session.requires_input"))).rejects.toThrow("boom")
  })
})
