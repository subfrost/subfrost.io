import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: vi.fn(() => ({ webhooks: { constructEvent: vi.fn() } })),
}))

import { constructWebhookEvent } from "@/lib/stripe/webhooks/verify"
import { getStripeClient } from "@/lib/stripe/client"

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test"
})

describe("constructWebhookEvent", () => {
  it("returns the parsed event for a valid signature", () => {
    const fake = { id: "evt_1", type: "charge.succeeded" }
    const ce = vi.fn(() => fake)
    vi.mocked(getStripeClient).mockReturnValueOnce({ webhooks: { constructEvent: ce } } as never)
    const out = constructWebhookEvent("raw-body", "sig")
    expect(out).toBe(fake)
    expect(ce).toHaveBeenCalledWith("raw-body", "sig", "whsec_test")
  })

  it("throws when the signature is invalid", () => {
    const ce = vi.fn(() => { throw new Error("No signatures found matching the expected signature") })
    vi.mocked(getStripeClient).mockReturnValueOnce({ webhooks: { constructEvent: ce } } as never)
    expect(() => constructWebhookEvent("raw", "bad")).toThrow(/signature/i)
  })

  it("throws when STRIPE_WEBHOOK_SECRET is unset", () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    expect(() => constructWebhookEvent("raw", "sig")).toThrow(/STRIPE_WEBHOOK_SECRET/)
  })

  it("throws when the signature header is missing", () => {
    expect(() => constructWebhookEvent("raw", null)).toThrow(/signature/i)
  })
})
