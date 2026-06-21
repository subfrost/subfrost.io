import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/stripe/config", () => ({ isLive: vi.fn(() => true) }))
vi.mock("@/lib/stripe/source/live/identity", () => ({ liveIdentityVerifications: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  default: { kycIntake: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } },
}))

import { syncStripeIdentity } from "@/lib/kyc/sync"
import { isLive } from "@/lib/stripe/config"
import { liveIdentityVerifications } from "@/lib/stripe/source/live/identity"
import prisma from "@/lib/prisma"
import type { StripeIdentityVerification } from "@/lib/stripe/shapes"

const v = (id: string, verdict: StripeIdentityVerification["verdict"] = "verified"): StripeIdentityVerification => ({
  id, verdict, lastError: null,
  document: { type: "passport", country: "US" },
  extracted: { firstName: "Ada", lastName: "Lovelace", dob: "1815-12-10" },
  email: "ada@x.io", createdAt: "2026-06-21T00:00:00.000Z",
})

beforeEach(() => vi.clearAllMocks())

describe("syncStripeIdentity", () => {
  it("creates a new intake for an unseen session", async () => {
    vi.mocked(liveIdentityVerifications).mockResolvedValueOnce([v("vs_1")])
    vi.mocked(prisma.kycIntake.findUnique).mockResolvedValueOnce(null as never)
    const res = await syncStripeIdentity()
    expect(res).toEqual({ created: 1, updated: 0, skipped: 0 })
    expect(prisma.kycIntake.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ externalId: "vs_1", status: "PENDING", riskScore: "LOW" }) }),
    )
  })

  it("preserves status/riskScore when the row already has a human disposition", async () => {
    vi.mocked(liveIdentityVerifications).mockResolvedValueOnce([v("vs_1", "requires_input")])
    vi.mocked(prisma.kycIntake.findUnique).mockResolvedValueOnce({ id: "k1", dispositions: [{ id: "d1" }] } as never)
    const res = await syncStripeIdentity()
    expect(res).toEqual({ created: 0, updated: 1, skipped: 0 })
    const arg = vi.mocked(prisma.kycIntake.update).mock.calls[0][0] as any
    expect(arg.data).not.toHaveProperty("status")
    expect(arg.data).not.toHaveProperty("riskScore")
    expect(arg.data).toHaveProperty("providerData")
  })

  it("refreshes status/riskScore when the row has no disposition yet", async () => {
    vi.mocked(liveIdentityVerifications).mockResolvedValueOnce([v("vs_1", "requires_input")])
    vi.mocked(prisma.kycIntake.findUnique).mockResolvedValueOnce({ id: "k1", dispositions: [] } as never)
    const res = await syncStripeIdentity()
    expect(res).toEqual({ created: 0, updated: 1, skipped: 0 })
    const arg = vi.mocked(prisma.kycIntake.update).mock.calls[0][0] as any
    expect(arg.data).toMatchObject({ status: "PENDING", riskScore: "HIGH" })
  })

  it("degrades to zeros when Stripe Identity is unavailable", async () => {
    vi.mocked(liveIdentityVerifications).mockRejectedValueOnce(new Error("not enabled"))
    const res = await syncStripeIdentity()
    expect(res).toEqual({ created: 0, updated: 0, skipped: 0 })
    expect(prisma.kycIntake.create).not.toHaveBeenCalled()
  })

  it("returns zeros without calling Stripe when not live", async () => {
    vi.mocked(isLive).mockReturnValueOnce(false)
    const res = await syncStripeIdentity()
    expect(res).toEqual({ created: 0, updated: 0, skipped: 0 })
    expect(liveIdentityVerifications).not.toHaveBeenCalled()
  })
})
