// tests/stripe/onramp-ui.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { NAV_GROUPS } from "@/lib/cms/admin-nav"

vi.mock("@/actions/cms/billing", () => ({
  listOnrampSessionsAction: vi.fn(),
}))

import { OnrampManager } from "@/components/cms/billing/OnrampManager"
import { listOnrampSessionsAction } from "@/actions/cms/billing"
import type { OnrampSession } from "@/lib/stripe/shapes"

const s = (id: string, status: OnrampSession["status"], over: Partial<OnrampSession> = {}): OnrampSession => ({
  id, status, createdAt: "2026-06-20T00:00:00.000Z",
  sourceCurrency: "USD", sourceAmount: 10000, destCurrency: "BTC", destAmount: 0.001,
  destNetwork: "bitcoin", walletAddress: "bc1qexample0000", transactionFee: 300, networkFee: 100,
  rejectionReason: null, ...over,
})

beforeEach(() => vi.mocked(listOnrampSessionsAction).mockReset())

describe("admin nav", () => {
  it("has an On-ramp item under Billing gated by BILLING_VIEW", () => {
    const billing = NAV_GROUPS.find((g) => g.key === "billing")!
    const item = billing.items.find((i) => i.href === "/admin/billing/onramp")
    expect(item).toBeTruthy()
    expect(item!.privilege).toBe("billing.read")
  })
})

describe("OnrampManager", () => {
  it("renders metrics and a session row after load", async () => {
    vi.mocked(listOnrampSessionsAction).mockResolvedValue({
      ok: true, live: false,
      sessions: [s("cos_1", "fulfillment_complete"), s("cos_2", "rejected", { rejectionReason: "blocked" })],
      metrics: { total: 2, completed: 1, conversionRate: 0.5, fiatVolume: 10000, totalFees: 400, cryptoVolumeByAsset: { BTC: 0.001 }, byStatus: { initialized: 0, requires_payment: 0, fulfillment_processing: 0, fulfillment_complete: 1, rejected: 1, expired: 0 } },
    } as never)
    render(<OnrampManager />)
    await waitFor(() => expect(screen.getByText("cos_1")).toBeInTheDocument())
    expect(screen.getByText("cos_2")).toBeInTheDocument()
    // conversion metric shown as a percentage
    expect(screen.getByText(/50(\.0)?%/)).toBeInTheDocument()
  })

  it("shows the error banner when the action fails", async () => {
    vi.mocked(listOnrampSessionsAction).mockResolvedValue({ ok: false, error: "Insufficient privileges" } as never)
    render(<OnrampManager />)
    await waitFor(() => expect(screen.getByText("Insufficient privileges")).toBeInTheDocument())
  })

  it("expands a row and shows the View in Stripe deep-link and rejection reason", async () => {
    const session = s("cos_rejected_1", "rejected", { rejectionReason: "sanctioned_entity" })
    vi.mocked(listOnrampSessionsAction).mockResolvedValue({
      ok: true, live: false,
      sessions: [session],
      metrics: { total: 1, completed: 0, conversionRate: 0, fiatVolume: 0, totalFees: 0, cryptoVolumeByAsset: {}, byStatus: { initialized: 0, requires_payment: 0, fulfillment_processing: 0, fulfillment_complete: 0, rejected: 1, expired: 0 } },
    } as never)
    render(<OnrampManager />)
    await waitFor(() => expect(screen.getByText("cos_rejected_1")).toBeInTheDocument())
    // Click the row button to expand
    fireEvent.click(screen.getByText("cos_rejected_1"))
    // View in Stripe link should now be visible
    const link = await screen.findByText(/View in Stripe/)
    expect(link).toBeInTheDocument()
    expect((link.closest("a") as HTMLAnchorElement).href).toContain("cos_rejected_1")
    expect((link.closest("a") as HTMLAnchorElement).href).toContain("onramp")
    // Rejection reason detail should be shown
    expect(screen.getByText(/sanctioned_entity/)).toBeInTheDocument()
  })
})
