// Pure types + assembly for the balance sheet. Combines computed lines (derived
// from treasury / accounting / equity at render time) with manual GL line items
// the operator enters, groups them by section, and runs the
// assets = liabilities + equity check. DB-free + serializable; unit-tested.
//
// SAFEs are modeled as a senior-to-common EQUITY preference (a preference in the
// waterfall, not debt), so the derived "equity attributable to common (409A
// basis)" = assets − liabilities − SAFE preference. A separate MEMO band carries
// notional figures (e.g. the FUEL overhang) that are deliberately EXCLUDED from
// every total and from the assets = liabilities + equity balance check.

// Manual GL items and the balance check only ever touch these three sections.
export type BalanceSheetSection = "ASSET" | "LIABILITY" | "EQUITY"

export const SECTION_LABELS: Record<BalanceSheetSection, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
}

export const round2 = (n: number): number => Math.round(n * 100) / 100

export interface BalanceSheetLine {
  id: string // manual item id, or "computed:<key>" for derived lines
  label: string
  amountUsd: number
  computed: boolean // derived (read-only) vs. manual (editable)
  note: string | null
}

export interface ManualItemRow {
  id: string
  section: BalanceSheetSection
  label: string
  amountUsd: number
  sortOrder: number
  notes: string | null
}

export interface BalanceSheetSectionView {
  section: BalanceSheetSection
  lines: BalanceSheetLine[]
  total: number
}

export interface BalanceSheetView {
  sections: Record<BalanceSheetSection, BalanceSheetSectionView>
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  liabilitiesPlusEquity: number
  difference: number // totalAssets - (liabilities + equity)
  balanced: boolean
  // SAFE senior-to-common preference (part of totalEquity, broken out so the
  // 409A attributable-to-common figure can subtract it). Notional, not debt.
  safePreferenceUsd: number
  // 409A basis: assets − liabilities − SAFE preference. Should stay positive.
  attributableToCommonUsd: number
  // Notional memo lines (e.g. FUEL overhang). NOT part of any total or the
  // balance check — presented for reference only.
  memo: BalanceSheetLine[]
  treasuryStale: boolean // computed treasury line came from a stale snapshot
  treasuryAvailable: boolean
  asOf: string // ISO
}

const SECTIONS: BalanceSheetSection[] = ["ASSET", "LIABILITY", "EQUITY"]

/** Combine computed (derived) lines with manual items and roll up totals. The
 *  `memo` lines and `safePreferenceUsd` inform the 409A view but never enter the
 *  section totals or the assets = liabilities + equity balance check. */
export function assembleBalanceSheet(
  computed: { section: BalanceSheetSection; line: BalanceSheetLine }[],
  manual: ManualItemRow[],
  meta: {
    asOf: string
    treasuryStale: boolean
    treasuryAvailable: boolean
    memo?: BalanceSheetLine[]
    safePreferenceUsd?: number
  },
): BalanceSheetView {
  const bySection: Record<BalanceSheetSection, BalanceSheetLine[]> = {
    ASSET: [], LIABILITY: [], EQUITY: [],
  }
  for (const c of computed) bySection[c.section].push(c.line)
  for (const m of [...manual].sort((a, b) => a.sortOrder - b.sortOrder)) {
    bySection[m.section].push({ id: m.id, label: m.label, amountUsd: m.amountUsd, computed: false, note: m.notes })
  }

  const sections = {} as Record<BalanceSheetSection, BalanceSheetSectionView>
  for (const s of SECTIONS) {
    const lines = bySection[s]
    sections[s] = { section: s, lines, total: round2(lines.reduce((acc, l) => acc + l.amountUsd, 0)) }
  }

  const totalAssets = sections.ASSET.total
  const totalLiabilities = sections.LIABILITY.total
  const totalEquity = sections.EQUITY.total
  const liabilitiesPlusEquity = round2(totalLiabilities + totalEquity)
  const difference = round2(totalAssets - liabilitiesPlusEquity)
  const safePreferenceUsd = round2(meta.safePreferenceUsd ?? 0)
  const attributableToCommonUsd = round2(totalAssets - totalLiabilities - safePreferenceUsd)
  return {
    sections,
    totalAssets,
    totalLiabilities,
    totalEquity,
    liabilitiesPlusEquity,
    difference,
    balanced: Math.abs(difference) < 0.01,
    safePreferenceUsd,
    attributableToCommonUsd,
    memo: meta.memo ?? [],
    treasuryStale: meta.treasuryStale,
    treasuryAvailable: meta.treasuryAvailable,
    asOf: meta.asOf,
  }
}
