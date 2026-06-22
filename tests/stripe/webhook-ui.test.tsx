import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { NAV_GROUPS } from "@/lib/cms/admin-nav"

vi.mock("@/actions/cms/billing", () => ({ listWebhookEventsAction: vi.fn() }))

import { WebhookEventsManager } from "@/components/cms/billing/WebhookEventsManager"
import { listWebhookEventsAction } from "@/actions/cms/billing"
import type { WebhookEventRow } from "@/lib/stripe/shapes"

const row = (id: string, type: string, status: string, over: Partial<WebhookEventRow> = {}): WebhookEventRow => ({
  id, type, status, handled: status === "processed", error: status === "failed" ? "boom" : null,
  stripeCreated: "2026-06-22T00:00:00.000Z", receivedAt: "2026-06-22T00:00:01.000Z",
  objectType: "charge", objectId: "ch_1", objectStatus: "succeeded", amount: 4200, currency: "usd", reason: null, ...over,
})

beforeEach(() => vi.mocked(listWebhookEventsAction).mockReset())

describe("admin nav", () => {
  it("has a Webhook events item under Billing gated by BILLING_VIEW", () => {
    const billing = NAV_GROUPS.find((g) => g.key === "billing")!
    const item = billing.items.find((i) => i.href === "/admin/billing/events")
    expect(item).toBeTruthy()
    expect(item!.privilege).toBe("BILLING_VIEW")
  })
})

describe("WebhookEventsManager", () => {
  it("renders event rows after load", async () => {
    vi.mocked(listWebhookEventsAction).mockResolvedValue({
      ok: true, live: false,
      events: [row("evt_1", "charge.succeeded", "processed"), row("evt_2", "identity.verification_session.verified", "failed", { objectType: "identity.verification_session", objectId: "vs_1" })],
    } as never)
    render(<WebhookEventsManager />)
    await waitFor(() => expect(screen.getByText("charge.succeeded")).toBeInTheDocument())
    expect(screen.getByText("identity.verification_session.verified")).toBeInTheDocument()
  })

  it("filters to failed-only", async () => {
    vi.mocked(listWebhookEventsAction).mockResolvedValue({
      ok: true, live: false,
      events: [row("evt_1", "charge.succeeded", "processed"), row("evt_2", "payout.paid", "failed")],
    } as never)
    render(<WebhookEventsManager />)
    await waitFor(() => expect(screen.getByText("charge.succeeded")).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText(/failed only/i))
    expect(screen.queryByText("charge.succeeded")).not.toBeInTheDocument()
    expect(screen.getByText("payout.paid")).toBeInTheDocument()
  })

  it("expands a row to show the View in Stripe deep-link", async () => {
    vi.mocked(listWebhookEventsAction).mockResolvedValue({ ok: true, live: false, events: [row("evt_1", "charge.succeeded", "processed")] } as never)
    render(<WebhookEventsManager />)
    await waitFor(() => expect(screen.getByText("charge.succeeded")).toBeInTheDocument())
    fireEvent.click(screen.getByText("charge.succeeded"))
    const link = await screen.findByText(/View in Stripe/)
    expect((link.closest("a") as HTMLAnchorElement).href).toContain("evt_1")
  })
})
