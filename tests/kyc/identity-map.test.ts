import { describe, it, expect } from "vitest"
import { mapIdentityVerification } from "@/lib/kyc/identity-map"
import type { StripeIdentityVerification } from "@/lib/stripe/shapes"

const base: StripeIdentityVerification = {
  id: "vs_1",
  verdict: "verified",
  lastError: null,
  document: { type: "passport", country: "US" },
  extracted: { firstName: "Ada", lastName: "Lovelace", dob: "1815-12-10" },
  email: "ada@x.io",
  createdAt: "2026-06-21T00:00:00.000Z",
}

describe("mapIdentityVerification", () => {
  it("maps verified -> PENDING/LOW and keeps the verdict in providerData", () => {
    const m = mapIdentityVerification(base)
    expect(m).toMatchObject({
      externalId: "vs_1",
      customerName: "Ada Lovelace",
      customerEmail: "ada@x.io",
      provider: "STRIPE_IDENTITY",
      status: "PENDING",
      riskScore: "LOW",
    })
    expect(m.submittedAt.toISOString()).toBe("2026-06-21T00:00:00.000Z")
    expect(m.providerData.verdict).toBe("verified")
  })

  it("derives riskScore from the verdict", () => {
    expect(mapIdentityVerification({ ...base, verdict: "processing" }).riskScore).toBe("MEDIUM")
    expect(mapIdentityVerification({ ...base, verdict: "canceled" }).riskScore).toBe("MEDIUM")
    expect(
      mapIdentityVerification({ ...base, verdict: "requires_input", lastError: { code: "document_unverified", reason: "blurry" } }).riskScore,
    ).toBe("HIGH")
  })

  it("falls back to (unknown)/empty when name/email are missing", () => {
    const m = mapIdentityVerification({
      ...base,
      extracted: { firstName: null, lastName: null, dob: null },
      email: "",
    })
    expect(m.customerName).toBe("(unknown)")
    expect(m.customerEmail).toBe("")
  })
})
