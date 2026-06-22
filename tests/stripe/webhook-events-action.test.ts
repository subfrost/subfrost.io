import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/lib/stripe/webhooks/store", () => ({ listWebhookEvents: vi.fn() }))

import { listWebhookEventsAction } from "@/actions/cms/billing"
import { currentUser } from "@/lib/cms/authz"
import { listWebhookEvents } from "@/lib/stripe/webhooks/store"

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.STRIPE_SECRET_KEY
})

describe("listWebhookEventsAction", () => {
  it("rejects a user without BILLING_VIEW", async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["fuel.read"] } as never)
    const res = await listWebhookEventsAction()
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/privileges/i)
    expect(listWebhookEvents).not.toHaveBeenCalled()
  })

  it("returns events + live for a BILLING_VIEW user", async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["billing.read"] } as never)
    vi.mocked(listWebhookEvents).mockResolvedValue([{ id: "evt_1", type: "charge.succeeded" } as never])
    const res = await listWebhookEventsAction({ status: "processed" })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.live).toBe(false)
      expect(res.events).toHaveLength(1)
    }
    expect(listWebhookEvents).toHaveBeenCalledWith({ status: "processed" })
  })
})
