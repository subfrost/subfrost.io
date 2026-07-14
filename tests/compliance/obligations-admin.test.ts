import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => {
  const complianceObligation = {
    findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(),
    createMany: vi.fn(), update: vi.fn(), delete: vi.fn(),
  }
  const client = { complianceObligation }
  return { prisma: client, default: client }
})

import {
  listObligations, seedObligations, completeObligation, updateObligation, ObligationError,
} from "@/lib/compliance/obligations"
import { OBLIGATION_SEED } from "@/lib/compliance/obligations-schema"
import { prisma } from "@/lib/prisma"

const db = prisma.complianceObligation as unknown as Record<string, ReturnType<typeof vi.fn>>
beforeEach(() => vi.clearAllMocks())

describe("seedObligations", () => {
  it("creates only missing keys", async () => {
    db.findMany.mockResolvedValueOnce([{ key: OBLIGATION_SEED[0].key }])
    db.createMany.mockResolvedValueOnce({ count: OBLIGATION_SEED.length - 1 })
    const r = await seedObligations()
    const arg = db.createMany.mock.calls[0][0]
    expect(arg.data).toHaveLength(OBLIGATION_SEED.length - 1)
    expect(arg.data.find((d: { key: string }) => d.key === OBLIGATION_SEED[0].key)).toBeUndefined()
    expect(r).toEqual({ created: OBLIGATION_SEED.length - 1 })
  })
  it("creates nothing when all present", async () => {
    db.findMany.mockResolvedValueOnce(OBLIGATION_SEED.map((s) => ({ key: s.key })))
    const r = await seedObligations()
    expect(db.createMany).not.toHaveBeenCalled()
    expect(r).toEqual({ created: 0 })
  })
})

describe("completeObligation", () => {
  it("rolls a recurring obligation forward and resets status", async () => {
    db.findUnique.mockResolvedValueOnce({ id: "x", cadence: "ANNUAL", dueDate: "2026-03-01" })
    db.update.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "x", key: "k", title: "t", category: "TAX", authority: null, description: null,
      cadence: "ANNUAL", status: data.status, dueDate: data.dueDate, owner: null,
      lastCompletedAt: data.lastCompletedAt, docUrl: null, notes: null, updatedAt: new Date("2026-07-14"),
    }))
    const r = await completeObligation("x", "2026-07-14")
    const data = db.update.mock.calls[0][0].data
    expect(data.dueDate).toBe("2027-03-01")
    expect(data.status).toBe("NOT_STARTED")
    expect(data.lastCompletedAt).toBe("2026-07-14")
    expect(r.dueDate).toBe("2027-03-01")
  })
  it("settles a one-time obligation as COMPLETE", async () => {
    db.findUnique.mockResolvedValueOnce({ id: "y", cadence: "ONE_TIME", dueDate: "2026-08-15" })
    db.update.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "y", key: "k", title: "t", category: "CORPORATE", authority: null, description: null,
      cadence: "ONE_TIME", status: data.status, dueDate: "2026-08-15", owner: null,
      lastCompletedAt: data.lastCompletedAt, docUrl: null, notes: null, updatedAt: new Date("2026-07-14"),
    }))
    const r = await completeObligation("y", "2026-07-14")
    const data = db.update.mock.calls[0][0].data
    expect(data.status).toBe("COMPLETE")
    expect(data.dueDate).toBeUndefined() // one-time keeps its date, just marks complete
    expect(r.status).toBe("COMPLETE")
  })
  it("throws when the obligation is missing", async () => {
    db.findUnique.mockResolvedValueOnce(null)
    await expect(completeObligation("z", "2026-07-14")).rejects.toBeInstanceOf(ObligationError)
  })
})

describe("updateObligation", () => {
  it("rejects invalid input without writing", async () => {
    db.findUnique.mockResolvedValueOnce({ id: "x" })
    await expect(updateObligation("x", { title: "", category: "TAX", cadence: "ANNUAL", status: "NOT_STARTED" }))
      .rejects.toBeInstanceOf(ObligationError)
    expect(db.update).not.toHaveBeenCalled()
  })
  it("throws when the row is missing", async () => {
    db.findUnique.mockResolvedValueOnce(null)
    await expect(updateObligation("gone", { title: "X", category: "TAX", cadence: "ANNUAL", status: "NOT_STARTED" }))
      .rejects.toBeInstanceOf(ObligationError)
  })
})

describe("listObligations", () => {
  it("maps rows with ISO updatedAt", async () => {
    db.findMany.mockResolvedValueOnce([{
      id: "x", key: "k", title: "t", category: "TAX", authority: null, description: null,
      cadence: "ANNUAL", dueDate: "2026-03-01", status: "NOT_STARTED", owner: null,
      lastCompletedAt: null, docUrl: null, notes: null, updatedAt: new Date("2026-06-01T00:00:00Z"),
    }])
    const r = await listObligations()
    expect(r[0].updatedAt).toBe("2026-06-01T00:00:00.000Z")
    expect(r[0].category).toBe("TAX")
  })
})
