import { describe, it, expect } from "vitest"
import { summarizeEvent } from "@/lib/stripe/webhooks/summary"
import type Stripe from "stripe"

const evt = (type: string, object: Record<string, unknown>): Stripe.Event =>
  ({ id: "evt_1", type, data: { object } } as unknown as Stripe.Event)

describe("summarizeEvent", () => {
  it("summarizes a charge into non-PII fields", () => {
    const s = summarizeEvent(evt("charge.succeeded", { object: "charge", id: "ch_1", status: "succeeded", amount: 4200, currency: "usd" }))
    expect(s).toEqual({ objectType: "charge", objectId: "ch_1", objectStatus: "succeeded", amount: 4200, currency: "usd", reason: null })
  })

  it("captures a dispute reason", () => {
    const s = summarizeEvent(evt("charge.dispute.created", { object: "dispute", id: "dp_1", status: "warning_needs_response", amount: 1000, currency: "usd", reason: "fraudulent" }))
    expect(s.reason).toBe("fraudulent")
  })

  it("NEVER includes PII from an identity event", () => {
    const s = summarizeEvent(evt("identity.verification_session.verified", {
      object: "identity.verification_session", id: "vs_1", status: "verified",
      verified_outputs: { first_name: "Ada", last_name: "Lovelace", dob: { year: 1815, month: 12, day: 10 } },
    }))
    expect(s).toEqual({ objectType: "identity.verification_session", objectId: "vs_1", objectStatus: "verified", amount: null, currency: null, reason: null })
    expect(JSON.stringify(s)).not.toMatch(/Ada|Lovelace|1815/)
  })

  it("is defensive when fields are missing", () => {
    const s = summarizeEvent(evt("customer.created", { object: "customer", id: "cus_1" }))
    expect(s).toEqual({ objectType: "customer", objectId: "cus_1", objectStatus: null, amount: null, currency: null, reason: null })
  })
})
