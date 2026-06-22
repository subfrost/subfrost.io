import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  default: { kycIntake: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } },
}))

import { upsertIdentityIntake } from "@/lib/kyc/sync"
import prisma from "@/lib/prisma"
import type { MappedIdentityIntake } from "@/lib/kyc/identity-map"

const m = (over: Partial<MappedIdentityIntake> = {}): MappedIdentityIntake => ({
  externalId: "vs_1", customerName: "Ada Lovelace", customerEmail: "ada@x.io",
  provider: "STRIPE_IDENTITY", submittedAt: new Date("2026-06-21T00:00:00Z"),
  status: "PENDING", riskScore: "HIGH",
  providerData: { verdict: "requires_input", lastError: null, document: { type: null, country: null }, extracted: { firstName: "Ada", lastName: "Lovelace", dob: null } },
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe("upsertIdentityIntake", () => {
  it("creates when unseen", async () => {
    vi.mocked(prisma.kycIntake.findUnique).mockResolvedValueOnce(null as never)
    expect(await upsertIdentityIntake(m())).toBe("created")
    expect(prisma.kycIntake.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ externalId: "vs_1", status: "PENDING", riskScore: "HIGH" }) }))
  })

  it("preserves status/riskScore when a human disposition exists", async () => {
    vi.mocked(prisma.kycIntake.findUnique).mockResolvedValueOnce({ id: "k1", dispositions: [{ id: "d1" }] } as never)
    expect(await upsertIdentityIntake(m())).toBe("updated")
    const arg = vi.mocked(prisma.kycIntake.update).mock.calls[0][0] as any
    expect(arg.data).not.toHaveProperty("status")
    expect(arg.data).toHaveProperty("providerData")
  })

  it("refreshes status/riskScore when no disposition yet", async () => {
    vi.mocked(prisma.kycIntake.findUnique).mockResolvedValueOnce({ id: "k1", dispositions: [] } as never)
    expect(await upsertIdentityIntake(m())).toBe("updated")
    const arg = vi.mocked(prisma.kycIntake.update).mock.calls[0][0] as any
    expect(arg.data).toMatchObject({ status: "PENDING", riskScore: "HIGH" })
  })
})
