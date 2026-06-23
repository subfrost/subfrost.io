import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => {
  const shareClass = { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
  const shareholder = { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
  const shareHolding = { findMany: vi.fn(), create: vi.fn(), count: vi.fn(), delete: vi.fn() }
  const instrument = { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
  const client = { shareClass, shareholder, shareHolding, instrument }
  return { prisma: client, default: client }
})

import prisma from "@/lib/prisma"
import {
  EquityError, createInstrument, createHolding, createShareClass, seedCommonStock,
} from "@/lib/financials/equity/store"

const cls = prisma.shareClass as unknown as Record<string, ReturnType<typeof vi.fn>>
const sh = prisma.shareholder as unknown as Record<string, ReturnType<typeof vi.fn>>
const hold = prisma.shareHolding as unknown as Record<string, ReturnType<typeof vi.fn>>
const inst = prisma.instrument as unknown as Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  ;[cls, sh, hold, inst].forEach((m) => Object.values(m).forEach((f) => f.mockReset()))
})

function instrumentRow(over: Record<string, unknown> = {}) {
  return {
    id: "i1", type: "SAFE", status: "OUTSTANDING", investorName: "Angel", investorEntity: null, investorEmail: null,
    shareholderId: null, amountUsd: 100000, signedAt: new Date("2026-03-01T00:00:00Z"), safeKind: "POST_MONEY",
    valuationCap: 10000000, discountRate: null, mfn: false, proRata: false, interestRate: null, maturityDate: null,
    tokenPct: null, tokenAmount: null, pdfUrl: null, envelopeId: null, notes: null, createdAt: new Date("2026-03-01T00:00:00Z"),
    shareholder: null, ...over,
  }
}

describe("createInstrument validation", () => {
  it("rejects an empty investor name", async () => {
    await expect(createInstrument({ type: "SAFE", investorName: "  ", amountUsd: 1000, signedAt: "2026-03-01" }))
      .rejects.toBeInstanceOf(EquityError)
  })
  it("rejects a negative amount", async () => {
    await expect(createInstrument({ type: "SAFE", investorName: "A", amountUsd: -5, signedAt: "2026-03-01" }))
      .rejects.toThrow(/non-negative/)
  })
  it("rejects a discount rate outside [0,1)", async () => {
    await expect(createInstrument({ type: "SAFE", investorName: "A", amountUsd: 1000, signedAt: "2026-03-01", discountRate: 1.5 }))
      .rejects.toThrow(/Discount rate/)
  })
  it("rejects a shareholder link that doesn't exist", async () => {
    sh.findUnique.mockResolvedValueOnce(null)
    await expect(createInstrument({ type: "SAFE", investorName: "A", amountUsd: 1000, signedAt: "2026-03-01", shareholderId: "missing" }))
      .rejects.toThrow(/Shareholder not found/)
  })
  it("creates a valid SAFE", async () => {
    inst.create.mockResolvedValueOnce(instrumentRow())
    const row = await createInstrument({ type: "SAFE", investorName: "Angel", amountUsd: 100000, signedAt: "2026-03-01", safeKind: "POST_MONEY", valuationCap: 10000000 })
    expect(row.investorName).toBe("Angel")
    expect(inst.create).toHaveBeenCalledTimes(1)
  })
})

describe("createHolding validation", () => {
  it("rejects non-positive shares", async () => {
    await expect(createHolding({ shareholderId: "s1", shareClassId: "c1", shares: 0, issuedAt: "2026-01-01" }))
      .rejects.toThrow(/positive/)
  })
  it("rejects when the shareholder is missing", async () => {
    sh.findUnique.mockResolvedValueOnce(null)
    await expect(createHolding({ shareholderId: "missing", shareClassId: "c1", shares: 100, issuedAt: "2026-01-01" }))
      .rejects.toThrow(/Shareholder not found/)
  })
  it("rejects when the share class is missing", async () => {
    sh.findUnique.mockResolvedValueOnce({ id: "s1" })
    cls.findUnique.mockResolvedValueOnce(null)
    await expect(createHolding({ shareholderId: "s1", shareClassId: "missing", shares: 100, issuedAt: "2026-01-01" }))
      .rejects.toThrow(/Share class not found/)
  })
})

describe("createShareClass validation", () => {
  it("rejects negative authorized shares", async () => {
    await expect(createShareClass({ name: "Common", type: "COMMON", authorizedShares: -1 }))
      .rejects.toThrow(/non-negative/)
  })
})

describe("seedCommonStock idempotency", () => {
  it("returns the existing common class without creating", async () => {
    cls.findFirst.mockResolvedValueOnce({ id: "c1", name: "Common Stock", type: "COMMON", authorizedShares: 10000000, parValue: 0.0001, notes: null, createdAt: new Date() })
    const row = await seedCommonStock()
    expect(row.id).toBe("c1")
    expect(cls.create).not.toHaveBeenCalled()
  })
  it("seeds 10,000,000 authorized common when none exists", async () => {
    cls.findFirst.mockResolvedValueOnce(null)
    cls.create.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => ({ id: "c2", notes: null, createdAt: new Date(), ...data }))
    const row = await seedCommonStock()
    expect(row.authorizedShares).toBe(10000000)
    expect(row.type).toBe("COMMON")
  })
})
