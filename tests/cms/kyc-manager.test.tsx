// tests/cms/kyc-manager.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

vi.mock("@/actions/cms/kyc", () => ({
  listIntakesAction: vi.fn(),
  recordDispositionAction: vi.fn(),
  rescreenOfacAction: vi.fn(),
  syncStripeIdentityAction: vi.fn(),
}))

import { KycManager } from "@/components/cms/KycManager"
import { listIntakesAction, syncStripeIdentityAction } from "@/actions/cms/kyc"

const row = {
  id: "k1", externalId: "vs_1", customerEmail: "ada@x.io", customerName: "Ada Lovelace",
  provider: "STRIPE_IDENTITY", riskScore: "LOW", status: "PENDING",
  submittedAt: "2026-06-21T00:00:00.000Z", latestDecision: null, dispositions: [],
  providerData: { verdict: "verified", lastError: null, document: { type: "passport", country: "US" }, extracted: { firstName: "Ada", lastName: "Lovelace", dob: "1815-12-10" } },
}

beforeEach(() => vi.clearAllMocks())

describe("KycManager", () => {
  it("shows a Sync from Stripe Identity button and runs the sync", async () => {
    vi.mocked(listIntakesAction).mockResolvedValue({ ok: true, intakes: [row] } as never)
    vi.mocked(syncStripeIdentityAction).mockResolvedValue({ ok: true, created: 1, updated: 0, skipped: 0 } as never)
    render(<KycManager />)
    const btn = await screen.findByRole("button", { name: /sync from stripe identity/i })
    fireEvent.click(btn)
    await waitFor(() => expect(syncStripeIdentityAction).toHaveBeenCalled())
  })

  it("reveals the Stripe verdict + extracted fields when a row is expanded", async () => {
    vi.mocked(listIntakesAction).mockResolvedValue({ ok: true, intakes: [row] } as never)
    render(<KycManager />)
    const toggle = await screen.findByRole("button", { name: /details/i })
    fireEvent.click(toggle)
    expect(await screen.findByText(/verified/i)).toBeInTheDocument()
    expect(screen.getByText(/passport/i)).toBeInTheDocument()
    // "Ada Lovelace" appears in the row header AND in the extracted field panel
    expect(screen.getAllByText(/Ada Lovelace/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/· DOB 1815-12-10/)).toBeInTheDocument()
  })
})
