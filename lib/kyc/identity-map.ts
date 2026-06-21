import type { IdentityVerdict, StripeIdentityVerification, IdentityProviderData } from "@/lib/stripe/shapes"

export interface MappedIdentityIntake {
  externalId: string
  customerName: string
  customerEmail: string
  provider: "STRIPE_IDENTITY"
  submittedAt: Date
  status: "PENDING"
  riskScore: "LOW" | "MEDIUM" | "HIGH"
  providerData: IdentityProviderData
}

// Stripe Identity gives no numeric risk score — derive a triage signal from the verdict.
const RISK: Record<IdentityVerdict, "LOW" | "MEDIUM" | "HIGH"> = {
  verified: "LOW",
  processing: "MEDIUM",
  requires_input: "HIGH",
  canceled: "MEDIUM",
}

export function mapIdentityVerification(v: StripeIdentityVerification): MappedIdentityIntake {
  const name = [v.extracted.firstName, v.extracted.lastName].filter(Boolean).join(" ").trim()
  return {
    externalId: v.id,
    customerName: name || "(unknown)",
    customerEmail: v.email || "",
    provider: "STRIPE_IDENTITY",
    submittedAt: new Date(v.createdAt),
    status: "PENDING", // human-in-the-loop: every synced intake awaits a human disposition
    riskScore: RISK[v.verdict],
    providerData: {
      verdict: v.verdict,
      lastError: v.lastError,
      document: v.document,
      extracted: v.extracted,
    },
  }
}
