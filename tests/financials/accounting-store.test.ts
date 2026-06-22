import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => {
  const payee = { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }
  const invoice = { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }
  const dieselPayment = { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }
  const kycIntake = { findUnique: vi.fn() }
  const user = { findUnique: vi.fn(), findMany: vi.fn() }
  const client = { payee, invoice, dieselPayment, kycIntake, user }
  return { prisma: client, default: client }
})

import {
  AccountingError, createInvoice, createPayee, linkPayment, listInvoices,
  listPayees, listPayments, listUnlinkedPayments, recordPayment, updateInvoiceStatus,
  updatePayee, listLinkableUsers, loadPayeeProfile,
} from "@/lib/financials/accounting/store"
import prisma from "@/lib/prisma"

const pe = prisma.payee as unknown as Record<string, ReturnType<typeof vi.fn>>
const inv = prisma.invoice as unknown as Record<string, ReturnType<typeof vi.fn>>
const pay = prisma.dieselPayment as unknown as Record<string, ReturnType<typeof vi.fn>>
const kyc = prisma.kycIntake as unknown as Record<string, ReturnType<typeof vi.fn>>
const usr = prisma.user as unknown as Record<string, ReturnType<typeof vi.fn>>

const D = (s: string) => new Date(s)
beforeEach(() => vi.clearAllMocks())

describe("listPayees", () => {
  it("maps rows and resolves kycCustomerName", async () => {
    pe.findMany.mockResolvedValueOnce([
      { id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: "k1", notes: null, userId: "u1", agreementUrl: "https://x/a.pdf", createdAt: D("2026-01-01T00:00:00Z"), kycIntake: { customerName: "Ada L" } },
    ])
    const rows = await listPayees()
    expect(pe.findMany).toHaveBeenCalledWith({ orderBy: { name: "asc" }, include: { kycIntake: { select: { customerName: true } } } })
    expect(rows[0]).toEqual({ id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: "k1", kycCustomerName: "Ada L", notes: null, userId: "u1", agreementUrl: "https://x/a.pdf", createdAt: "2026-01-01T00:00:00.000Z" })
  })
})

describe("createPayee", () => {
  it("rejects an empty name", async () => {
    await expect(createPayee({ name: "  ", type: "PERSON" })).rejects.toBeInstanceOf(AccountingError)
    expect(pe.create).not.toHaveBeenCalled()
  })
  it("trims and creates", async () => {
    pe.create.mockResolvedValueOnce({ id: "pe2", name: "Acme", type: "ORG", kycIntakeId: null, notes: null, userId: null, agreementUrl: null, createdAt: D("2026-01-02T00:00:00Z"), kycIntake: null })
    const row = await createPayee({ name: " Acme ", type: "ORG" })
    expect(pe.create.mock.calls[0][0].data).toMatchObject({ name: "Acme", type: "ORG", kycIntakeId: null, notes: null })
    expect(row.kycCustomerName).toBeNull()
    expect(row.userId).toBeNull()
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
  it("rejects an empty ref", async () => {
    await expect(createInvoice({ ref: "  ", payeeId: "pe1", description: "x", amountUsd: 1, issuedAt: "2026-02-01" })).rejects.toBeInstanceOf(AccountingError)
    expect(inv.create).not.toHaveBeenCalled()
  })
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
    inv.findUnique.mockResolvedValueOnce({ id: "i1" })
    inv.update.mockResolvedValueOnce({ id: "i1", ref: "INV-1", payeeId: "pe1", description: "x", amountUsd: 1, amountDiesel: null, issuedAt: D("2026-02-01T00:00:00Z"), status: "PAID", pdfUrl: null, createdAt: D("2026-02-01T00:00:00Z"), payee: { name: "Ada" } })
    const row = await updateInvoiceStatus("i1", "PAID")
    expect(inv.update.mock.calls[0][0]).toMatchObject({ where: { id: "i1" }, data: { status: "PAID" } })
    expect(row.status).toBe("PAID")
  })
  it("throws AccountingError when the invoice is missing", async () => {
    inv.findUnique.mockResolvedValueOnce(null)
    await expect(updateInvoiceStatus("nope", "PAID")).rejects.toBeInstanceOf(AccountingError)
    expect(inv.update).not.toHaveBeenCalled()
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

describe("listPayments", () => {
  it("orders by paidAt desc, includes the invoice ref, and maps to ISO", async () => {
    pay.findMany.mockResolvedValueOnce([
      { id: "p1", txid: "txa", vout: 0, amountDiesel: 2, recipientAddress: "bc1", paidAt: D("2026-02-11T00:00:00Z"), blockHeight: null, invoiceId: "i1", source: "MANUAL", createdAt: D("2026-02-11T00:00:00Z"), invoice: { ref: "INV-1" } },
    ])
    const rows = await listPayments()
    expect(pay.findMany.mock.calls[0][0]).toMatchObject({ orderBy: { paidAt: "desc" }, include: { invoice: { select: { ref: true } } } })
    expect(rows[0].invoiceRef).toBe("INV-1")
    expect(rows[0].paidAt).toBe("2026-02-11T00:00:00.000Z")
  })
})

describe("listUnlinkedPayments", () => {
  it("queries invoiceId null", async () => {
    pay.findMany.mockResolvedValueOnce([])
    await listUnlinkedPayments()
    expect(pay.findMany.mock.calls[0][0].where).toEqual({ invoiceId: null })
  })
})

describe("updatePayee", () => {
  const baseRow = { id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: null, notes: null, userId: null, agreementUrl: null, createdAt: D("2026-01-01T00:00:00Z"), kycIntake: null }

  it("throws when the payee does not exist", async () => {
    pe.findUnique.mockResolvedValueOnce(null)
    await expect(updatePayee("nope", { name: "x" })).rejects.toBeInstanceOf(AccountingError)
  })

  it("rejects an empty name when name is in the patch", async () => {
    pe.findUnique.mockResolvedValueOnce(baseRow)
    await expect(updatePayee("pe1", { name: "   " })).rejects.toBeInstanceOf(AccountingError)
    expect(pe.update).not.toHaveBeenCalled()
  })

  it("writes only the keys present in the patch (notes cleared with null)", async () => {
    pe.findUnique.mockResolvedValueOnce(baseRow)
    pe.update.mockResolvedValueOnce({ ...baseRow, notes: null })
    await updatePayee("pe1", { notes: null })
    expect(pe.update.mock.calls[0][0].data).toEqual({ notes: null })
  })

  it("verifies a linked user exists and is not taken, then sets userId", async () => {
    pe.findUnique.mockResolvedValueOnce(baseRow) // the target payee
    usr.findUnique.mockResolvedValueOnce({ id: "u1" })
    pe.findUnique.mockResolvedValueOnce(null) // no other payee holds u1
    pe.update.mockResolvedValueOnce({ ...baseRow, userId: "u1" })
    const row = await updatePayee("pe1", { userId: "u1" })
    expect(pe.update.mock.calls[0][0].data).toEqual({ userId: "u1" })
    expect(row.userId).toBe("u1")
  })

  it("rejects linking a user already tied to another payee", async () => {
    pe.findUnique.mockResolvedValueOnce(baseRow)
    usr.findUnique.mockResolvedValueOnce({ id: "u1" })
    pe.findUnique.mockResolvedValueOnce({ id: "peOTHER" }) // u1 already linked
    await expect(updatePayee("pe1", { userId: "u1" })).rejects.toBeInstanceOf(AccountingError)
    expect(pe.update).not.toHaveBeenCalled()
  })

  it("unlinks a user with explicit null without touching prisma.user", async () => {
    pe.findUnique.mockResolvedValueOnce({ ...baseRow, userId: "u1" })
    pe.update.mockResolvedValueOnce({ ...baseRow, userId: null })
    await updatePayee("pe1", { userId: null })
    expect(usr.findUnique).not.toHaveBeenCalled()
    expect(pe.update.mock.calls[0][0].data).toEqual({ userId: null })
  })

  it("clears agreementUrl with explicit null", async () => {
    pe.findUnique.mockResolvedValueOnce(baseRow)
    pe.update.mockResolvedValueOnce({ ...baseRow, agreementUrl: null })
    await updatePayee("pe1", { agreementUrl: null })
    expect(pe.update.mock.calls[0][0].data).toEqual({ agreementUrl: null })
  })

  it("clears kycIntakeId with explicit null without verifying the intake", async () => {
    pe.findUnique.mockResolvedValueOnce(baseRow)
    pe.update.mockResolvedValueOnce({ ...baseRow, kycIntakeId: null })
    await updatePayee("pe1", { kycIntakeId: null })
    expect(kyc.findUnique).not.toHaveBeenCalled()
    expect(pe.update.mock.calls[0][0].data).toEqual({ kycIntakeId: null })
  })

  it("rejects a kycIntakeId that does not exist", async () => {
    pe.findUnique.mockResolvedValueOnce(baseRow)
    kyc.findUnique.mockResolvedValueOnce(null)
    await expect(updatePayee("pe1", { kycIntakeId: "missing" })).rejects.toBeInstanceOf(AccountingError)
    expect(pe.update).not.toHaveBeenCalled()
  })
})

describe("listLinkableUsers", () => {
  it("returns active users mapped to {id,name,email,avatarUrl,role}", async () => {
    usr.findMany.mockResolvedValueOnce([
      { id: "u1", name: "Ada", email: "ada@x.io", avatarUrl: null, role: "AUTHOR" },
    ])
    const rows = await listLinkableUsers()
    expect(usr.findMany).toHaveBeenCalledWith({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, avatarUrl: true, role: true } })
    expect(rows[0]).toEqual({ id: "u1", name: "Ada", email: "ada@x.io", avatarUrl: null, role: "AUTHOR" })
  })
})

describe("loadPayeeProfile", () => {
  it("returns null when the payee is missing", async () => {
    pe.findUnique.mockResolvedValueOnce(null)
    expect(await loadPayeeProfile("nope")).toBeNull()
  })

  it("shapes payee + user + kyc and assembles invoices/payments/totals", async () => {
    pe.findUnique.mockResolvedValueOnce({
      id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: "k1", notes: null, userId: "u1", agreementUrl: null,
      createdAt: D("2026-01-01T00:00:00Z"),
      kycIntake: { id: "k1", customerName: "Ada L", status: "APPROVED" },
      user: { id: "u1", name: "Ada", email: "ada@x.io", avatarUrl: null, bio: "math", twitter: null, status: null, role: "AUTHOR" },
    })
    inv.findMany.mockResolvedValueOnce([
      { id: "i1", ref: "INV-1", payeeId: "pe1", description: "w", amountUsd: 100, amountDiesel: null, issuedAt: D("2026-02-01T00:00:00Z"), status: "PAID", pdfUrl: null, createdAt: D("2026-02-01T00:00:00Z"), payee: { name: "Ada" } },
    ])
    pay.findMany.mockResolvedValueOnce([
      { id: "p1", txid: "t", vout: null, amountDiesel: 5, recipientAddress: "bc1", paidAt: D("2026-02-02T00:00:00Z"), blockHeight: null, invoiceId: "i1", source: "MANUAL", createdAt: D("2026-02-02T00:00:00Z"), invoice: { ref: "INV-1" } },
      { id: "p2", txid: "u", vout: null, amountDiesel: 9, recipientAddress: "bc1", paidAt: D("2026-02-03T00:00:00Z"), blockHeight: null, invoiceId: null, source: "MANUAL", createdAt: D("2026-02-03T00:00:00Z"), invoice: null },
    ])
    const prof = await loadPayeeProfile("pe1")
    expect(prof).not.toBeNull()
    expect(prof!.user?.email).toBe("ada@x.io")
    expect(prof!.kyc).toEqual({ id: "k1", customerName: "Ada L", status: "APPROVED" })
    expect(prof!.payments.map((p) => p.id)).toEqual(["p1"]) // p2 unlinked → excluded
    expect(prof!.totals.totalUsd).toBe(100)
    expect(prof!.totals.totalDiesel).toBe(5)
    expect(inv.findMany.mock.calls[0][0].where.payeeId).toBe("pe1")
  })
})
