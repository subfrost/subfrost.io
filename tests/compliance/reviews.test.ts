import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => {
  const reviewLink = { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() }
  const reviewSession = { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() }
  const client = { reviewLink, reviewSession }
  return { prisma: client, default: client }
})

import prisma from "@/lib/prisma"
import {
  createReviewLink,
  authenticateReviewLink,
  resolveReviewSession,
  revokeReviewLink,
  scopeSurfaces,
  scopeAllows,
} from "@/lib/compliance/reviews"
import { hashPassword } from "@/lib/compliance/passwords"

const link = prisma.reviewLink as unknown as Record<string, ReturnType<typeof vi.fn>>
const sess = prisma.reviewSession as unknown as Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  Object.values(link).forEach((f) => f.mockReset())
  Object.values(sess).forEach((f) => f.mockReset())
})

describe("scope policy", () => {
  it("compliance-full exposes every surface", () => {
    expect(scopeSurfaces("compliance-full").map((s) => s.key)).toEqual([
      "program", "obligations", "fincen", "kyc", "mtl", "documents",
    ])
  })
  it("fincen-only and kyc-only are narrow", () => {
    expect(scopeSurfaces("fincen-only").map((s) => s.key)).toEqual(["fincen"])
    expect(scopeAllows("fincen-only", "kyc")).toBe(false)
    expect(scopeAllows("kyc-only", "kyc")).toBe(true)
    expect(scopeAllows("kyc-only", "documents")).toBe(false)
  })
})

describe("createReviewLink", () => {
  it("returns a password + path and persists a bcrypt hash", async () => {
    link.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "rvl1", token: data.token, reviewerLabel: data.reviewerLabel, reviewerEmail: data.reviewerEmail,
      scope: data.scope, notes: data.notes, createdAt: new Date(), expiresAt: data.expiresAt,
      revokedAt: null, _count: { sessions: 0 },
    }))
    const out = await createReviewLink({ reviewerLabel: "Acme AML", scope: "kyc-only", createdByUserId: "u1" })
    expect(out.password).toMatch(/-\d{4}$/)
    expect(out.path).toBe(`/compliance/review/${out.link.token}`)
    const passed = link.create.mock.calls[0][0].data
    expect(passed.passwordHash).not.toContain(out.password) // hashed, not plaintext
    expect(out.link.active).toBe(true)
  })
})

describe("authenticateReviewLink", () => {
  async function linkRow(over: Record<string, unknown> = {}) {
    return {
      id: "rvl1", token: "tok", passwordHash: await hashPassword("frost-river-warm-comet-1234"),
      reviewerLabel: "Acme", scope: "compliance-full", revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000), ...over,
    }
  }

  it("rejects a wrong password", async () => {
    link.findUnique.mockResolvedValueOnce(await linkRow())
    expect(await authenticateReviewLink("tok", "nope", {})).toBeNull()
    expect(sess.create).not.toHaveBeenCalled()
  })

  it("rejects a revoked or expired link", async () => {
    link.findUnique.mockResolvedValueOnce(await linkRow({ revokedAt: new Date() }))
    expect(await authenticateReviewLink("tok", "frost-river-warm-comet-1234", {})).toBeNull()
    link.findUnique.mockResolvedValueOnce(await linkRow({ expiresAt: new Date(Date.now() - 1000) }))
    expect(await authenticateReviewLink("tok", "frost-river-warm-comet-1234", {})).toBeNull()
  })

  it("mints a session on success", async () => {
    link.findUnique.mockResolvedValueOnce(await linkRow())
    sess.create.mockResolvedValueOnce({})
    const res = await authenticateReviewLink("tok", "frost-river-warm-comet-1234", { ua: "UA", ip: "1.2.3.4" })
    expect(res?.scope).toBe("compliance-full")
    expect(res?.sessionToken).toBeTruthy()
    expect(sess.create).toHaveBeenCalledTimes(1)
    // IP stored as a salted hash, never raw
    const created = sess.create.mock.calls[0][0].data
    expect(created.ipHash).not.toBe("1.2.3.4")
    expect(created.ipHash).toBeTruthy()
  })
})

describe("revokeReviewLink", () => {
  it("revokes the link and kills its live sessions immediately", async () => {
    link.update.mockResolvedValueOnce({})
    sess.updateMany.mockResolvedValueOnce({ count: 2 })
    await revokeReviewLink("rvl1", "u1")
    expect(link.update).toHaveBeenCalledWith({ where: { id: "rvl1" }, data: { revokedAt: expect.any(Date), revokedByUserId: "u1" } })
    expect(sess.updateMany).toHaveBeenCalledWith({ where: { reviewLinkId: "rvl1", revokedAt: null }, data: { revokedAt: expect.any(Date) } })
  })
})

describe("resolveReviewSession", () => {
  it("returns null for an unknown / revoked / expired session", async () => {
    expect(await resolveReviewSession(undefined)).toBeNull()
    sess.findUnique.mockResolvedValueOnce(null)
    expect(await resolveReviewSession("cookie")).toBeNull()
    sess.findUnique.mockResolvedValueOnce({
      id: "s1", revokedAt: null, expiresAt: new Date(Date.now() + 1000),
      reviewLink: { id: "rvl1", token: "tok", reviewerLabel: "Acme", scope: "kyc-only", revokedAt: new Date(), expiresAt: new Date(Date.now() + 1000) },
    })
    expect(await resolveReviewSession("cookie")).toBeNull() // link revoked
  })

  it("returns context + touches lastSeenAt for a valid session", async () => {
    sess.findUnique.mockResolvedValueOnce({
      id: "s1", revokedAt: null, expiresAt: new Date(Date.now() + 1000),
      reviewLink: { id: "rvl1", token: "tok", reviewerLabel: "Acme", scope: "kyc-only", revokedAt: null, expiresAt: new Date(Date.now() + 1000) },
    })
    sess.update.mockResolvedValueOnce({})
    const ctx = await resolveReviewSession("cookie")
    expect(ctx).toMatchObject({ sessionId: "s1", reviewLinkId: "rvl1", scope: "kyc-only", token: "tok" })
    expect(sess.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { lastSeenAt: expect.any(Date) } })
  })
})
