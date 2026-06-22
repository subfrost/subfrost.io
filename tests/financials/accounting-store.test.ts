import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => {
  const payee = { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() }
  const invoice = { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }
  const dieselPayment = { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }
  const client = { payee, invoice, dieselPayment }
  return { prisma: client, default: client }
})

import {
  AccountingError, createInvoice, createPayee, linkPayment, listInvoices,
  listPayees, listUnlinkedPayments, recordPayment, updateInvoiceStatus,
} from "@/lib/financials/accounting/store"
import prisma from "@/lib/prisma"

const pe = prisma.payee as unknown as Record<string, ReturnType<typeof vi.fn>>
const inv = prisma.invoice as unknown as Record<string, ReturnType<typeof vi.fn>>
const pay = prisma.dieselPayment as unknown as Record<string, ReturnType<typeof vi.fn>>

const D = (s: string) => new Date(s)
beforeEach(() => vi.clearAllMocks())

describe("listPayees", () => {
  it("maps rows and resolves kycCustomerName", async () => {
    pe.findMany.mockResolvedValueOnce([
      { id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: "k1", notes: null, createdAt: D("2026-01-01T00:00:00Z"), kycIntake: { customerName: "Ada L" } },
    ])
    const rows = await listPayees()
    expect(pe.findMany).toHaveBeenCalledWith({ orderBy: { name: "asc" }, include: { kycIntake: { select: { customerName: true } } } })
    expect(rows[0]).toEqual({ id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: "k1", kycCustomerName: "Ada L", notes: null, createdAt: "2026-01-01T00:00:00.000Z" })
  })
})

describe("createPayee", () => {
  it("rejects an empty name", async () => {
    await expect(createPayee({ name: "  ", type: "PERSON" })).rejects.toBeInstanceOf(AccountingError)
    expect(pe.create).not.toHaveBeenCalled()
  })
  it("trims and creates", async () => {
    pe.create.mockResolvedValueOnce({ id: "pe2", name: "Acme", type: "ORG", kycIntakeId: null, notes: null, createdAt: D("2026-01-02T00:00:00Z"), kycIntake: null })
    const row = await createPayee({ name: " Acme ", type: "ORG" })
    expect(pe.create.mock.calls[0][0].data).toMatchObject({ name: "Acme", type: "ORG", kycIntakeId: null, notes: null })
    expect(row.kycCustomerName).toBeNull()
  })
})

describe("listInvoices", () => {
  it("builds the where clause from filters", async () => {
    inv.findMany.mockResolvedValueOnce([])
    await listInvoices({ payeeId: "pe1", status: "OPEN", from: "2026-01-01", to: "2026-12-31" })
    const arg = inv.findMany.mock.calls[0][0]
    expect(arg.where.payeeId).toBe("pe1")
    expect(arg.where.status).toBe("OPEN")
    expect(arg.where.issuedAt.gte).toEqual(D("2026-01-01"))
    expect(arg.where.issuedAt.lte).toEqual(D("2026-12-31"))
    expect(arg.orderBy).toEqual({ issuedAt: "desc" })
  })
  it("maps payeeName from the included payee", async () => {
    inv.findMany.mockResolvedValueOnce([
      { id: "i1", ref: "INV-1", payeeId: "pe1", description: "w", amountUsd: 100, amountDiesel: null, issuedAt: D("2026-02-01T00:00:00Z"), status: "OPEN", pdfUrl: null, createdAt: D("2026-02-01T00:00:00Z"), payee: { name: "Ada" } },
    ])
    const rows = await listInvoices()
    expect(rows[0].payeeName).toBe("Ada")
    expect(rows[0].issuedAt).toBe("2026-02-01T00:00:00.000Z")
  })
})

describe("createInvoice", () => {
  it("rejects a missing payee", async () => {
    pe.findUnique.mockResolvedValueOnce(null)
    await expect(createInvoice({ ref: "INV-9", payeeId: "nope", description: "x", amountUsd: 1, issuedAt: "2026-02-01" })).rejects.toBeInstanceOf(AccountingError)
    expect(inv.create).not.toHaveBeenCalled()
  })
  it("rejects a duplicate ref", async () => {
    pe.findUnique.mockResolvedValueOnce({ id: "pe1" })
    inv.findUnique.mockResolvedValueOnce({ id: "i1" })
    await expect(createInvoice({ ref: "INV-1", payeeId: "pe1", description: "x", amountUsd: 1, issuedAt: "2026-02-01" })).rejects.toBeInstanceOf(AccountingError)
    expect(inv.create).not.toHaveBeenCalled()
  })
  it("creates when valid", async () => {
    pe.findUnique.mockResolvedValueOnce({ id: "pe1" })
    inv.findUnique.mockResolvedValueOnce(null)
    inv.create.mockResolvedValueOnce({ id: "i2", ref: "INV-2", payeeId: "pe1", description: "x", amountUsd: 50, amountDiesel: 1, issuedAt: D("2026-02-02T00:00:00Z"), status: "OPEN", pdfUrl: null, createdAt: D("2026-02-02T00:00:00Z"), payee: { name: "Ada" } })
    const row = await createInvoice({ ref: " INV-2 ", payeeId: "pe1", description: "x", amountUsd: 50, amountDiesel: 1, issuedAt: "2026-02-02" })
    expect(inv.create.mock.calls[0][0].data.ref).toBe("INV-2")
    expect(row.status).toBe("OPEN")
  })
})

describe("updateInvoiceStatus", () => {
  it("updates and maps", async () => {
    inv.update.mockResolvedValueOnce({ id: "i1", ref: "INV-1", payeeId: "pe1", description: "x", amountUsd: 1, amountDiesel: null, issuedAt: D("2026-02-01T00:00:00Z"), status: "PAID", pdfUrl: null, createdAt: D("2026-02-01T00:00:00Z"), payee: { name: "Ada" } })
    const row = await updateInvoiceStatus("i1", "PAID")
    expect(inv.update.mock.calls[0][0]).toMatchObject({ where: { id: "i1" }, data: { status: "PAID" } })
    expect(row.status).toBe("PAID")
  })
})

describe("recordPayment", () => {
  const base = { txid: "txa", vout: 0, amountDiesel: 2, recipientAddress: "bc1", paidAt: "2026-02-11", source: "MANUAL" as const }
  it("creates when none exists (idempotency key not found)", async () => {
    pay.findFirst.mockResolvedValueOnce(null)
    pay.create.mockResolvedValueOnce({ id: "p1", txid: "txa", vout: 0, amountDiesel: 2, recipientAddress: "bc1", paidAt: D("2026-02-11T00:00:00Z"), blockHeight: null, invoiceId: null, source: "MANUAL", createdAt: D("2026-02-11T00:00:00Z"), invoice: null })
    const row = await recordPayment(base)
    expect(pay.findFirst).toHaveBeenCalledWith({ where: { txid: "txa", vout: 0 } })
    expect(pay.create).toHaveBeenCalled()
    expect(row.invoiceRef).toBeNull()
  })
  it("updates the existing row (idempotent) when (txid,vout) already present", async () => {
    pay.findFirst.mockResolvedValueOnce({ id: "p1" })
    pay.update.mockResolvedValueOnce({ id: "p1", txid: "txa", vout: 0, amountDiesel: 2, recipientAddress: "bc1", paidAt: D("2026-02-11T00:00:00Z"), blockHeight: null, invoiceId: null, source: "MANUAL", createdAt: D("2026-02-11T00:00:00Z"), invoice: null })
    await recordPayment(base)
    expect(pay.create).not.toHaveBeenCalled()
    expect(pay.update.mock.calls[0][0].where).toEqual({ id: "p1" })
  })
})

describe("linkPayment", () => {
  it("rejects when the invoice is missing", async () => {
    inv.findUnique.mockResolvedValueOnce(null)
    await expect(linkPayment("p1", "nope")).rejects.toBeInstanceOf(AccountingError)
  })
  it("links when both exist", async () => {
    inv.findUnique.mockResolvedValueOnce({ id: "i1" })
    pay.findUnique.mockResolvedValueOnce({ id: "p1" })
    pay.update.mockResolvedValueOnce({ id: "p1", txid: "txa", vout: 0, amountDiesel: 2, recipientAddress: "bc1", paidAt: D("2026-02-11T00:00:00Z"), blockHeight: null, invoiceId: "i1", source: "MANUAL", createdAt: D("2026-02-11T00:00:00Z"), invoice: { ref: "INV-1" } })
    const row = await linkPayment("p1", "i1")
    expect(pay.update.mock.calls[0][0]).toMatchObject({ where: { id: "p1" }, data: { invoiceId: "i1" } })
    expect(row.invoiceRef).toBe("INV-1")
  })
})

describe("listUnlinkedPayments", () => {
  it("queries invoiceId null", async () => {
    pay.findMany.mockResolvedValueOnce([])
    await listUnlinkedPayments()
    expect(pay.findMany.mock.calls[0][0].where).toEqual({ invoiceId: null })
  })
})
