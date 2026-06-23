import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

vi.mock("@/actions/cms/accounting", () => ({
  accountingOverviewAction: vi.fn(),
  createPayeeAction: vi.fn(),
  createInvoiceAction: vi.fn(),
  updateInvoiceStatusAction: vi.fn(),
  recordPaymentAction: vi.fn(),
  linkPaymentAction: vi.fn(),
  exportLedgerCsvAction: vi.fn(),
}))

import { AccountingManager } from "@/components/cms/financials/AccountingManager"
import type { AccountingOverviewResult } from "@/actions/cms/accounting"
import type { InvoiceRow, PayeeRow, PaymentRow } from "@/lib/financials/accounting/shapes"

const payee = (over: Partial<PayeeRow> = {}): PayeeRow => ({
  id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: null, kycCustomerName: null, notes: null, userId: null, agreementUrl: null, createdAt: "2026-01-01T00:00:00.000Z", ...over,
})
const invoice = (over: Partial<InvoiceRow> = {}): InvoiceRow => ({
  id: "i1", ref: "INV-1", payeeId: "pe1", payeeName: "Ada", description: "w", amountUsd: 100, amountDiesel: null, issuedAt: "2026-02-01T00:00:00.000Z", status: "OPEN", pdfUrl: null, createdAt: "2026-02-01T00:00:00.000Z", ...over,
})
const payment = (over: Partial<PaymentRow> = {}): PaymentRow => ({
  id: "p1", txid: "txa", vout: null, amountDiesel: 1, recipientAddress: "bc1", paidAt: "2026-02-02T00:00:00.000Z", blockHeight: null, invoiceId: null, invoiceRef: null, source: "MANUAL", createdAt: "2026-02-02T00:00:00.000Z", ...over,
})
const ok = (over: Partial<{ payees: PayeeRow[]; invoices: InvoiceRow[]; payments: PaymentRow[] }> = {}): AccountingOverviewResult => {
  const payees = over.payees ?? []
  const invoices = over.invoices ?? []
  const payments = over.payments ?? []
  return {
    ok: true,
    overview: {
      payees, invoices, payments,
      metrics: { totalPaidUsd: 0, totalPaidDiesel: 0, openInvoices: invoices.filter((i) => i.status === "OPEN").length, unlinkedPayments: payments.filter((p) => p.invoiceId === null).length },
    },
  }
}

beforeEach(() => cleanup())

describe("AccountingManager", () => {
  it("shows the unauthorized message when the result is not ok", () => {
    const { getByText } = render(<AccountingManager initial={{ ok: false, error: "unauthorized" }} />)
    expect(getByText(/do not have access/i)).toBeTruthy()
  })

  it("renders the empty invoices state", () => {
    const { getByText } = render(<AccountingManager initial={ok()} />)
    expect(getByText(/No invoices yet/i)).toBeTruthy()
  })

  it("renders the unlinked-payments alert when a payment is unlinked", () => {
    const { getAllByText } = render(<AccountingManager initial={ok({ payments: [payment()] })} />)
    expect(getAllByText(/unlinked payment/i).length).toBeGreaterThan(0)
  })

  it("renders a status pill and a KYC badge for a KYC'd payee's invoice", () => {
    const { getByText, getAllByText } = render(
      <AccountingManager initial={ok({ payees: [payee({ kycIntakeId: "k1" })], invoices: [invoice({ status: "PAID" })] })} />,
    )
    expect(getByText("PAID")).toBeTruthy()
    expect(getAllByText("KYC").length).toBeGreaterThan(0)
  })
  it("links a payee name to its profile in the Payees tab", () => {
    const { getByText, getByRole } = render(<AccountingManager initial={ok({ payees: [payee()] })} />)
    fireEvent.click(getByText("Payees"))
    const link = getByRole("link", { name: /Ada/ })
    expect(link.getAttribute("href")).toBe("/admin/financials/payees/pe1")
  })
})
