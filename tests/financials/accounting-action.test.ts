import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/lib/cms/audit", () => ({ audit: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/headers", () => ({ headers: vi.fn(async () => ({ get: () => null })) }))
vi.mock("@/lib/financials/accounting/store", () => ({
  AccountingError: class AccountingError extends Error {},
  listPayees: vi.fn(),
  listInvoices: vi.fn(),
  listPayments: vi.fn(),
  createPayee: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoiceStatus: vi.fn(),
  recordPayment: vi.fn(),
  linkPayment: vi.fn(),
}))

import {
  accountingOverviewAction, createInvoiceAction, createPayeeAction,
  exportLedgerCsvAction, linkPaymentAction, recordPaymentAction, updateInvoiceStatusAction,
} from "@/actions/cms/accounting"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import { currentUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import * as store from "@/lib/financials/accounting/store"
import { AccountingError } from "@/lib/financials/accounting/store"

const asUser = (privileges: string[]) => ({ id: "u1", email: "a@b.io", privileges }) as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(currentUser).mockResolvedValue(asUser([FINANCIALS_PRIVILEGE]))
})

describe("gating", () => {
  it("accountingOverviewAction rejects a caller without the privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser([]))
    expect(await accountingOverviewAction()).toEqual({ ok: false, error: "unauthorized" })
    expect(store.listInvoices).not.toHaveBeenCalled()
  })
  it("createPayeeAction rejects a caller without the privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser([]))
    expect(await createPayeeAction({ name: "x", type: "PERSON" })).toEqual({ ok: false, error: "unauthorized" })
    expect(store.createPayee).not.toHaveBeenCalled()
  })
  it("createInvoiceAction rejects + does not touch the store without the privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser([]))
    expect(await createInvoiceAction({ ref: "INV-1", payeeId: "pe1", description: "x", amountUsd: 1, issuedAt: "2026-02-01" })).toEqual({ ok: false, error: "unauthorized" })
    expect(store.createInvoice).not.toHaveBeenCalled()
  })
  it("updateInvoiceStatusAction rejects + does not touch the store without the privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser([]))
    expect(await updateInvoiceStatusAction("i1", "PAID")).toEqual({ ok: false, error: "unauthorized" })
    expect(store.updateInvoiceStatus).not.toHaveBeenCalled()
  })
  it("recordPaymentAction rejects + does not touch the store without the privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser([]))
    expect(await recordPaymentAction({ txid: "t", amountDiesel: 1, recipientAddress: "bc1", paidAt: "2026-02-01" })).toEqual({ ok: false, error: "unauthorized" })
    expect(store.recordPayment).not.toHaveBeenCalled()
  })
  it("linkPaymentAction rejects + does not touch the store without the privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser([]))
    expect(await linkPaymentAction("p1", "i1")).toEqual({ ok: false, error: "unauthorized" })
    expect(store.linkPayment).not.toHaveBeenCalled()
  })
  it("exportLedgerCsvAction rejects + does not touch the store without the privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser([]))
    expect(await exportLedgerCsvAction()).toEqual({ ok: false, error: "unauthorized" })
    expect(store.listPayees).not.toHaveBeenCalled()
  })
})

describe("accountingOverviewAction", () => {
  it("returns rows + computed metrics", async () => {
    vi.mocked(store.listPayees).mockResolvedValue([])
    vi.mocked(store.listInvoices).mockResolvedValue([
      { id: "i1", ref: "INV-1", payeeId: "pe1", payeeName: "Ada", description: "w", amountUsd: 100, amountDiesel: null, issuedAt: "2026-02-01T00:00:00.000Z", status: "PAID", pdfUrl: null, createdAt: "2026-02-01T00:00:00.000Z" },
    ])
    vi.mocked(store.listPayments).mockResolvedValue([
      { id: "p1", txid: "t", vout: null, amountDiesel: 3, recipientAddress: "bc1", paidAt: "2026-02-02T00:00:00.000Z", blockHeight: null, invoiceId: null, invoiceRef: null, source: "MANUAL", createdAt: "2026-02-02T00:00:00.000Z" },
    ])
    const r = await accountingOverviewAction()
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.overview.metrics).toEqual({ totalPaidUsd: 100, totalPaidDiesel: 3, openInvoices: 0, unlinkedPayments: 1 })
    }
  })
})

describe("createPayeeAction", () => {
  it("creates, audits, and returns the payee", async () => {
    const payee = { id: "pe1", name: "Ada", type: "PERSON" as const, kycIntakeId: null, kycCustomerName: null, notes: null, createdAt: "2026-01-01T00:00:00.000Z" }
    vi.mocked(store.createPayee).mockResolvedValue(payee)
    const r = await createPayeeAction({ name: "Ada", type: "PERSON" })
    expect(r).toEqual({ ok: true, value: payee })
    expect(audit).toHaveBeenCalledWith("accounting_payee_create", expect.objectContaining({ actorId: "u1", target: "Ada" }))
  })
})

describe("createInvoiceAction", () => {
  it("maps an AccountingError to { ok:false, error }", async () => {
    vi.mocked(store.createInvoice).mockRejectedValue(new AccountingError("Invoice ref already exists: INV-1"))
    const r = await createInvoiceAction({ ref: "INV-1", payeeId: "pe1", description: "x", amountUsd: 1, issuedAt: "2026-02-01" })
    expect(r).toEqual({ ok: false, error: "Invoice ref already exists: INV-1" })
  })
  it("creates, audits, and revalidates on the happy path", async () => {
    vi.mocked(store.createInvoice).mockResolvedValue({ id: "i2", ref: "INV-2", payeeId: "pe1", payeeName: "Ada", description: "x", amountUsd: 50, amountDiesel: null, issuedAt: "2026-02-02T00:00:00.000Z", status: "OPEN", pdfUrl: null, createdAt: "2026-02-02T00:00:00.000Z" })
    const r = await createInvoiceAction({ ref: "INV-2", payeeId: "pe1", description: "x", amountUsd: 50, issuedAt: "2026-02-02" })
    expect(r).toEqual({ ok: true, value: expect.objectContaining({ ref: "INV-2" }) })
    expect(audit).toHaveBeenCalledWith("accounting_invoice_create", expect.objectContaining({ target: "INV-2" }))
  })
})

describe("updateInvoiceStatusAction", () => {
  it("updates, audits, and revalidates", async () => {
    vi.mocked(store.updateInvoiceStatus).mockResolvedValue({ id: "i1", ref: "INV-1", payeeId: "pe1", payeeName: "Ada", description: "x", amountUsd: 1, amountDiesel: null, issuedAt: "2026-02-01T00:00:00.000Z", status: "PAID", pdfUrl: null, createdAt: "2026-02-01T00:00:00.000Z" })
    const r = await updateInvoiceStatusAction("i1", "PAID")
    expect(r.ok).toBe(true)
    expect(audit).toHaveBeenCalledWith("accounting_invoice_status", expect.objectContaining({ actorId: "u1", target: "INV-1 -> PAID" }))
  })
})

describe("recordPaymentAction", () => {
  it("records, audits, and revalidates", async () => {
    vi.mocked(store.recordPayment).mockResolvedValue({ id: "p1", txid: "txa", vout: null, amountDiesel: 1, recipientAddress: "bc1", paidAt: "2026-02-02T00:00:00.000Z", blockHeight: null, invoiceId: null, invoiceRef: null, source: "MANUAL", createdAt: "2026-02-02T00:00:00.000Z" })
    const r = await recordPaymentAction({ txid: "txa", amountDiesel: 1, recipientAddress: "bc1", paidAt: "2026-02-02" })
    expect(r.ok).toBe(true)
    expect(audit).toHaveBeenCalledWith("accounting_payment_record", expect.objectContaining({ actorId: "u1", target: "txa" }))
  })
})

describe("linkPaymentAction", () => {
  it("links and audits", async () => {
    vi.mocked(store.linkPayment).mockResolvedValue({ id: "p1", txid: "t", vout: null, amountDiesel: 1, recipientAddress: "bc1", paidAt: "2026-02-02T00:00:00.000Z", blockHeight: null, invoiceId: "i1", invoiceRef: "INV-1", source: "MANUAL", createdAt: "2026-02-02T00:00:00.000Z" })
    const r = await linkPaymentAction("p1", "i1")
    expect(r.ok).toBe(true)
    expect(audit).toHaveBeenCalledWith("accounting_payment_link", expect.objectContaining({ actorId: "u1", target: "t -> INV-1" }))
  })
})

describe("exportLedgerCsvAction", () => {
  it("returns a CSV string with the header", async () => {
    vi.mocked(store.listPayees).mockResolvedValue([])
    vi.mocked(store.listInvoices).mockResolvedValue([])
    vi.mocked(store.listPayments).mockResolvedValue([])
    const r = await exportLedgerCsvAction()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.split("\n")[0]).toContain("Invoice,Payee,Type")
  })
})
