import { describe, it, expect } from "vitest"
import {
  summaryMetrics, totalsByPayee, totalsByPeriod, periodKey, csvEscape, toCsv,
  type InvoiceRow, type PaymentRow, type PayeeRow,
} from "@/lib/financials/accounting/shapes"

const payees: PayeeRow[] = [
  { id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: "k1", kycCustomerName: "Ada Lovelace", notes: null, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "pe2", name: "Acme, Inc", type: "ORG", kycIntakeId: null, kycCustomerName: null, notes: null, createdAt: "2026-01-01T00:00:00.000Z" },
]
const invoices: InvoiceRow[] = [
  { id: "i1", ref: "INV-1", payeeId: "pe1", payeeName: "Ada", description: "work", amountUsd: 1000, amountDiesel: 2, issuedAt: "2026-02-10T00:00:00.000Z", status: "PAID", pdfUrl: null, createdAt: "2026-02-10T00:00:00.000Z" },
  { id: "i2", ref: "INV-2", payeeId: "pe1", payeeName: "Ada", description: "more", amountUsd: 500, amountDiesel: null, issuedAt: "2026-05-01T00:00:00.000Z", status: "OPEN", pdfUrl: null, createdAt: "2026-05-01T00:00:00.000Z" },
  { id: "i3", ref: "INV-3", payeeId: "pe2", payeeName: "Acme, Inc", description: "svc", amountUsd: 2000, amountDiesel: 4, issuedAt: "2026-05-20T00:00:00.000Z", status: "PAID", pdfUrl: "https://x/p.pdf", createdAt: "2026-05-20T00:00:00.000Z" },
]
const payments: PaymentRow[] = [
  { id: "p1", txid: "txa", vout: 0, amountDiesel: 2, recipientAddress: "bc1ada", paidAt: "2026-02-11T00:00:00.000Z", blockHeight: 1, invoiceId: "i1", invoiceRef: "INV-1", source: "MANUAL", createdAt: "2026-02-11T00:00:00.000Z" },
  { id: "p2", txid: "txb", vout: 0, amountDiesel: 4, recipientAddress: "bc1acme", paidAt: "2026-05-21T00:00:00.000Z", blockHeight: 2, invoiceId: "i3", invoiceRef: "INV-3", source: "ONCHAIN", createdAt: "2026-05-21T00:00:00.000Z" },
  { id: "p3", txid: "txc", vout: null, amountDiesel: 1.5, recipientAddress: "bc1unk", paidAt: "2026-06-01T00:00:00.000Z", blockHeight: null, invoiceId: null, invoiceRef: null, source: "ONCHAIN", createdAt: "2026-06-01T00:00:00.000Z" },
]

describe("summaryMetrics", () => {
  it("sums paid USD, all DIESEL, and counts open + unlinked", () => {
    expect(summaryMetrics(invoices, payments)).toEqual({
      totalPaidUsd: 3000,      // i1 + i3 (PAID)
      totalPaidDiesel: 7.5,    // p1 + p2 + p3
      openInvoices: 1,         // i2
      unlinkedPayments: 1,     // p3
    })
  })
})

describe("totalsByPayee", () => {
  it("rolls up invoice count, paid USD, and linked DIESEL per payee", () => {
    const rows = totalsByPayee(payees, invoices, payments)
    expect(rows.find((r) => r.payeeId === "pe1")).toEqual({ payeeId: "pe1", payeeName: "Ada", invoiceCount: 2, totalUsd: 1000, totalDiesel: 2 })
    expect(rows.find((r) => r.payeeId === "pe2")).toEqual({ payeeId: "pe2", payeeName: "Acme, Inc", invoiceCount: 1, totalUsd: 2000, totalDiesel: 4 })
  })
})

describe("periodKey / totalsByPeriod", () => {
  it("formats month, quarter, year keys (UTC)", () => {
    expect(periodKey("2026-02-10T00:00:00.000Z", "month")).toBe("2026-02")
    expect(periodKey("2026-05-20T00:00:00.000Z", "quarter")).toBe("2026-Q2")
    expect(periodKey("2026-05-20T00:00:00.000Z", "year")).toBe("2026")
  })
  it("aggregates invoices by month, newest first", () => {
    const rows = totalsByPeriod(invoices, "month")
    expect(rows.map((r) => r.period)).toEqual(["2026-05", "2026-02"])
    expect(rows[0]).toEqual({ period: "2026-05", invoiceCount: 2, totalUsd: 2500 })
  })
})

describe("csvEscape", () => {
  it("quotes fields with commas, quotes, or newlines and doubles quotes", () => {
    expect(csvEscape("plain")).toBe("plain")
    expect(csvEscape("Acme, Inc")).toBe('"Acme, Inc"')
    expect(csvEscape('a "b"')).toBe('"a ""b"""')
  })
  it("quotes fields containing a newline or carriage return", () => {
    expect(csvEscape("a\nb")).toBe('"a\nb"')
    expect(csvEscape("a\rb")).toBe('"a\rb"')
  })
})

describe("toCsv", () => {
  const csv = toCsv(invoices, payments, payees)
  const lines = csv.split("\n")
  it("emits a header row", () => {
    expect(lines[0]).toBe("Invoice,Payee,Type,Description,Amount USD,Amount DIESEL (expected),Status,Issued,Settling txids,Paid DIESEL,PDF")
  })
  it("emits one row per invoice with settling txids and escaped payee", () => {
    expect(lines).toHaveLength(4) // header + 3 invoices
    const acme = lines.find((l) => l.startsWith("INV-3"))!
    expect(acme).toContain('"Acme, Inc"')
    expect(acme).toContain("txb")
    expect(acme).toContain("2026-05-20")
  })
})
