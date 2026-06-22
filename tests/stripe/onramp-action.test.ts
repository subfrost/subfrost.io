import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))

import { listOnrampSessionsAction } from "@/actions/cms/billing"
import { currentUser } from "@/lib/cms/authz"

beforeEach(() => {
  vi.mocked(currentUser).mockReset()
  delete process.env.STRIPE_SECRET_KEY // demo source
})

describe("listOnrampSessionsAction", () => {
  it("rejects a user without BILLING_VIEW", async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["fuel.read"] } as never)
    const res = await listOnrampSessionsAction("30d")
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/privileges/i)
  })

  it("returns sessions + metrics + live for a BILLING_VIEW user", async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["billing.read"] } as never)
    const res = await listOnrampSessionsAction("all")
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.live).toBe(false)
      expect(res.sessions.length).toBeGreaterThan(0)
      expect(res.metrics.total).toBe(res.sessions.length)
    }
  })
})
