import { describe, it, expect } from "vitest"
import {
  summarizeCapTable, summarizeInstruments,
  type ShareClassRow, type ShareHoldingRow, type InstrumentRow,
} from "@/lib/financials/equity/shapes"
import {
  assembleBalanceSheet,
  type BalanceSheetLine, type BalanceSheetSection, type ManualItemRow,
} from "@/lib/financials/balance-sheet/shapes"

function cls(over: Partial<ShareClassRow> = {}): ShareClassRow {
  return { id: "c1", name: "Common Stock", type: "COMMON", authorizedShares: 10_000_000, parValue: 0.0001, notes: null, createdAt: "2026-01-01T00:00:00Z", ...over }
}
function holding(over: Partial<ShareHoldingRow> = {}): ShareHoldingRow {
  return { id: "h1", shareholderId: "s1", shareholderName: "Founder", shareClassId: "c1", shareClassName: "Common Stock", shares: 10_000_000, issuedAt: "2026-01-01T00:00:00Z", certificateNo: null, notes: null, ...over }
}
function safe(over: Partial<InstrumentRow> = {}): InstrumentRow {
  return {
    id: "i1", type: "SAFE", status: "OUTSTANDING", investorName: "Angel", investorEntity: null, investorEmail: null,
    shareholderId: null, shareholderName: null, amountUsd: 100_000, signedAt: "2026-03-01T00:00:00Z",
    safeKind: "POST_MONEY", valuationCap: 10_000_000, discountRate: null, mfn: false, proRata: false,
    interestRate: null, maturityDate: null, tokenPct: null, tokenAmount: null, pdfUrl: null, envelopeId: null,
    notes: null, createdAt: "2026-03-01T00:00:00Z", ...over,
  }
}

describe("summarizeCapTable", () => {
  it("computes 100% for a single founder holding all common", () => {
    const cap = summarizeCapTable([cls()], [holding()])
    expect(cap.issuedShares).toBe(10_000_000)
    expect(cap.byHolder).toHaveLength(1)
    expect(cap.byHolder[0].ownershipPct).toBe(100)
    expect(cap.byClass[0].issuedShares).toBe(10_000_000)
  })

  it("splits ownership across two holders and aggregates per shareholder", () => {
    const cap = summarizeCapTable([cls()], [
      holding({ id: "h1", shareholderId: "s1", shareholderName: "A", shares: 7_500_000 }),
      holding({ id: "h2", shareholderId: "s2", shareholderName: "B", shares: 2_000_000 }),
      holding({ id: "h3", shareholderId: "s1", shareholderName: "A", shares: 500_000 }),
    ])
    expect(cap.issuedShares).toBe(10_000_000)
    const a = cap.byHolder.find((h) => h.shareholderId === "s1")!
    expect(a.shares).toBe(8_000_000)
    expect(a.ownershipPct).toBe(80)
    expect(cap.byHolder[0].shareholderId).toBe("s1") // sorted by shares desc
  })

  it("handles an empty cap table without dividing by zero", () => {
    const cap = summarizeCapTable([cls()], [])
    expect(cap.issuedShares).toBe(0)
    expect(cap.byHolder).toHaveLength(0)
  })
})

describe("summarizeInstruments", () => {
  it("totals SAFE money + implied post-money ownership; tokens tracked separately", () => {
    const s = summarizeInstruments([
      safe({ id: "i1", amountUsd: 100_000, valuationCap: 10_000_000 }), // 1%
      safe({ id: "i2", amountUsd: 250_000, valuationCap: 10_000_000 }), // 2.5%
      safe({ id: "i3", type: "TOKEN_WARRANT", safeKind: null, valuationCap: null, amountUsd: 50_000, tokenPct: 3 }),
      safe({ id: "i4", status: "CANCELLED", amountUsd: 999_999 }), // excluded
    ])
    expect(s.totalSafeRaisedUsd).toBe(350_000)
    expect(s.totalOutstandingUsd).toBe(400_000) // SAFEs + token, excludes cancelled
    expect(s.impliedSafeOwnershipPct).toBe(3.5)
    expect(s.totalTokenPct).toBe(3)
    expect(s.safeOwnership.find((l) => l.instrumentId === "i1")?.impliedPostMoneyPct).toBe(1)
  })

  it("leaves implied ownership null for pre-money or cap-less SAFEs", () => {
    const s = summarizeInstruments([
      safe({ id: "i1", safeKind: "PRE_MONEY", valuationCap: 10_000_000 }),
      safe({ id: "i2", safeKind: "POST_MONEY", valuationCap: null }),
    ])
    expect(s.safeOwnership.every((l) => l.impliedPostMoneyPct === null)).toBe(true)
    expect(s.impliedSafeOwnershipPct).toBe(0)
  })
})

describe("assembleBalanceSheet", () => {
  const meta = { asOf: "2026-06-23T00:00:00Z", treasuryStale: false, treasuryAvailable: true }
  const line = (section: BalanceSheetSection, label: string, amt: number): { section: BalanceSheetSection; line: BalanceSheetLine } => ({
    section, line: { id: `computed:${label}`, label, amountUsd: amt, computed: true, note: null },
  })
  const manual = (section: BalanceSheetSection, label: string, amt: number, sortOrder = 0): ManualItemRow => ({
    id: `m-${label}`, section, label, amountUsd: amt, sortOrder, notes: null,
  })

  it("rolls up sections and flags the imbalance", () => {
    const v = assembleBalanceSheet(
      [line("ASSET", "Treasury", 500_000), line("LIABILITY", "SAFEs", 350_000)],
      [manual("EQUITY", "Common", 1000)],
      meta,
    )
    expect(v.totalAssets).toBe(500_000)
    expect(v.totalLiabilities).toBe(350_000)
    expect(v.totalEquity).toBe(1000)
    expect(v.liabilitiesPlusEquity).toBe(351_000)
    expect(v.difference).toBe(149_000)
    expect(v.balanced).toBe(false)
  })

  it("balances when manual entries reconcile the statement", () => {
    const v = assembleBalanceSheet(
      [line("ASSET", "Cash", 351_000)],
      [manual("LIABILITY", "AP", 1000), manual("EQUITY", "Equity", 350_000)],
      meta,
    )
    expect(v.balanced).toBe(true)
    expect(v.difference).toBe(0)
  })

  it("orders manual lines by sortOrder within a section", () => {
    const v = assembleBalanceSheet([], [manual("ASSET", "Z", 1, 2), manual("ASSET", "A", 1, 1)], meta)
    expect(v.sections.ASSET.lines.map((l) => l.label)).toEqual(["A", "Z"])
  })
})
