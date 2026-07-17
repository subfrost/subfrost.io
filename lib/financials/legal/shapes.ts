// Pure types + math for the legal register (entities, agreements, OYL deserters,
// funded-investor obligations). DB-free and serializable (ISO dates), so every
// function here is unit-testable without Prisma. Powers /admin/legal, the
// "Deserter SAFEs" subtab of /admin/financials/safes, and the entity profile.

import type { ExplorerChain } from "@/lib/explorers"
import type { PayeeProfile } from "@/lib/financials/accounting/shapes"

export type LegalEntityKind = "PERSON" | "ORG"
export type LegalEntityCategory =
  | "FUNDED_INVESTOR"
  | "DESERTER"
  | "VOID_NONFUNDER"
  | "COUNTERPARTY"
  | "EMPLOYEE"
export type LegalScope = "SUBFROST" | "OYL"
export type LegalAgreementType =
  | "SAFE"
  | "TOKEN_RIGHTS"
  | "ADVISOR"
  | "CONTRACTOR"
  | "NDA"
  | "INTEGRATION"
  | "IP_ASSIGNMENT"
  | "RELEASE"
  | "BOARD_CONSENT"
  | "OTHER"
export type LegalAgreementStatus = "DRAFT" | "SENT" | "SIGNED" | "VOID"
export type DesertionStatus = "RETAINED" | "DESERTED" | "UNDECIDED"
export type SwapStatus =
  | "NOT_STARTED"
  | "PROPOSED"
  | "ARCA_SIGNED"
  | "ALEC_SIGNED"
  | "FULLY_SIGNED"
  | "CONVERTED"
export type OylFunding = "FUNDED" | "UNFUNDED_VOID"

export const LEGAL_ENTITY_CATEGORIES: LegalEntityCategory[] = [
  "FUNDED_INVESTOR", "DESERTER", "VOID_NONFUNDER", "COUNTERPARTY", "EMPLOYEE",
]
export const LEGAL_ENTITY_CATEGORY_LABELS: Record<LegalEntityCategory, string> = {
  FUNDED_INVESTOR: "Funded investor",
  DESERTER: "Deserter",
  VOID_NONFUNDER: "Void (unfunded)",
  COUNTERPARTY: "Counterparty",
  EMPLOYEE: "Employee",
}
export const LEGAL_AGREEMENT_TYPES: LegalAgreementType[] = [
  "SAFE", "TOKEN_RIGHTS", "ADVISOR", "CONTRACTOR", "NDA", "INTEGRATION",
  "IP_ASSIGNMENT", "RELEASE", "BOARD_CONSENT", "OTHER",
]
export const LEGAL_AGREEMENT_TYPE_LABELS: Record<LegalAgreementType, string> = {
  SAFE: "SAFE",
  TOKEN_RIGHTS: "Token rights",
  ADVISOR: "Advisor",
  CONTRACTOR: "Contractor",
  NDA: "NDA",
  INTEGRATION: "Integration",
  IP_ASSIGNMENT: "IP assignment",
  RELEASE: "Release",
  BOARD_CONSENT: "Board consent",
  OTHER: "Other",
}
export const SWAP_STATUS_LABELS: Record<SwapStatus, string> = {
  NOT_STARTED: "Not started",
  PROPOSED: "Proposed",
  ARCA_SIGNED: "Arca signed",
  ALEC_SIGNED: "Alec signed",
  FULLY_SIGNED: "Fully signed",
  CONVERTED: "Converted → DIESEL",
}
export const DESERTION_STATUS_LABELS: Record<DesertionStatus, string> = {
  RETAINED: "Retained vest",
  DESERTED: "Deserted vest",
  UNDECIDED: "Undecided",
}

export const round2 = (n: number): number => Math.round(n * 100) / 100

// ---------- DIESEL conversion ---------------------------------------
//
// Canonical OYL token-rights formula (from the corrected obligations doc):
//   DIESEL = (purchase ÷ post-money cap) × 0.5 conversion × 440,000 premine.
// Used to derive a funded investor's owed DIESEL from their SAFE, and offered as
// a default when an operator records a deserter's equity-swap conversion.
export const DIESEL_PREMINE = 440_000
export const DIESEL_CONVERSION_FACTOR = 0.5

export function dieselFromSafe(purchaseUsd: number, valuationCap: number): number {
  if (!Number.isFinite(purchaseUsd) || !Number.isFinite(valuationCap) || valuationCap <= 0) return 0
  return round2((purchaseUsd / valuationCap) * DIESEL_CONVERSION_FACTOR * DIESEL_PREMINE)
}

// ---------- rows -----------------------------------------------------

export interface LegalAgreementRow {
  id: string
  entityId: string
  type: LegalAgreementType
  status: LegalAgreementStatus
  title: string
  counterpartyName: string | null
  scope: LegalScope
  signedAt: string | null
  pdfUrl: string | null
  envelopeId: string | null
  notes: string | null
  createdAt: string
}

export interface DeserterRow {
  id: string
  entityId: string
  oylRole: string | null
  oylTokenPct: number | null
  desertedVest: DesertionStatus
  deserterEquityPct: number | null
  dieselConverted: number | null
  swapStatus: SwapStatus
  arcaSignedOff: boolean
  alecSignedOff: boolean
  notes: string | null
}

export interface OylObligationRow {
  id: string
  entityId: string
  funding: OylFunding
  purchaseUsd: number | null
  valuationCap: number | null
  dieselOwed: number
  dieselClaimable: number
  onchainTxid: string | null
  onchainAddress: string | null
  fundedAt: string | null
  vestingNote: string | null
  notes: string | null
}

export interface LegalEntityRow {
  id: string
  name: string
  kind: LegalEntityKind
  category: LegalEntityCategory
  scope: LegalScope
  email: string | null
  userId: string | null
  payeeId: string | null
  shareholderId: string | null
  notes: string | null
  tags: string[]
  addresses: string[]
  createdAt: string
  // resolved link names (read-side joins), null when unlinked
  userName: string | null
  payeeName: string | null
  shareholderName: string | null
  agreementCount: number
  // satellites (present only for the relevant category)
  deserter: DeserterRow | null
  obligation: OylObligationRow | null
}

export interface LegalEntityProfile {
  entity: LegalEntityRow
  agreements: LegalAgreementRow[]
}

// ---------- unified entity dossier -----------------------------------
//
// Everything about one counterparty in one place: identity + tags, signed docs
// (e-sign envelopes grouped into per-agreement version chains + linked signed
// files), invoices/payments (via the linked Payee), FUEL, and on-chain txids —
// all with explorer deep-links. Assembled by loadEntityDossier(); DB-free below.

/** One e-sign envelope version in an agreement's version chain. */
export interface DossierEnvelope {
  id: string
  subject: string
  kind: string
  status: string
  version: number
  agreementKey: string | null
  createdAt: string // ISO
  completedAt: string | null // ISO
  href: string // /admin/documents/[id]
}

/** A "template" = all versions of one agreement (shared agreementKey), newest first. */
export interface DossierDocGroup {
  key: string // agreementKey, else the single envelope id
  label: string // human template label (subject / kind)
  versions: DossierEnvelope[]
}

/** A file linked to the entity (any EntityFileLink role), with a deep-link path
 *  into the file navigator. */
export interface DossierFile {
  linkId: string
  fileId: string
  name: string
  role: string
  scope: string
  annotation: string | null
  filePath: string
}

/** An on-chain settlement touching this entity, with explorer links. */
export interface DossierOnchainTx {
  source: "DIESEL_PAYMENT" | "OYL_OBLIGATION"
  chain: ExplorerChain
  txid: string
  address: string | null
  amount: number | null
  unit: string | null // "DIESEL" | "USD"
  date: string | null // ISO
  txUrl: string
  addrUrl: string | null
}

/** A FUEL allocation matched to one of the entity's addresses. */
export interface DossierFuel {
  address: string
  amount: number
  note: string | null
  addrUrl: string
}

export interface EntityDossier {
  entity: LegalEntityRow
  tags: string[]
  addresses: string[]
  agreements: LegalAgreementRow[]
  payee: PayeeProfile | null // linked payee's full profile (invoices + payments)
  docGroups: DossierDocGroup[] // envelopes grouped into version chains
  signedFiles: DossierFile[]
  onchain: DossierOnchainTx[]
  fuel: DossierFuel[]
  fuelTotal: number
  // Cap-table-descended (modeled, 2:1) FUEL for founders / SAFE investors /
  // team — distinct from the address-matched community `fuel` above. Null when
  // the entity isn't in the cap-table pool.
  capTableFuel: { amount: number; source: string } | null
}

/** Pure grouping of envelopes into per-agreement version chains (newest first).
 *  Keyed by agreementKey; envelopes without one form singleton groups. */
export function groupEnvelopeVersions(envelopes: DossierEnvelope[]): DossierDocGroup[] {
  const byKey = new Map<string, DossierEnvelope[]>()
  for (const e of envelopes) {
    const key = e.agreementKey ?? e.id
    const arr = byKey.get(key) ?? []
    arr.push(e)
    byKey.set(key, arr)
  }
  const groups: DossierDocGroup[] = []
  for (const [key, list] of byKey) {
    list.sort((a, b) => b.version - a.version || (a.createdAt < b.createdAt ? 1 : -1))
    groups.push({ key, label: list[0].subject || list[0].kind, versions: list })
  }
  // newest agreement (by its latest version's createdAt) first
  groups.sort((a, b) => (a.versions[0].createdAt < b.versions[0].createdAt ? 1 : -1))
  return groups
}

// ---------- summaries ------------------------------------------------

export interface DeserterSummary {
  count: number
  retained: number
  deserted: number
  undecided: number
  totalEquityPct: number
  totalDieselConverted: number
  fullySigned: number
  converted: number
}

export function summarizeDeserters(rows: DeserterRow[]): DeserterSummary {
  return {
    count: rows.length,
    retained: rows.filter((d) => d.desertedVest === "RETAINED").length,
    deserted: rows.filter((d) => d.desertedVest === "DESERTED").length,
    undecided: rows.filter((d) => d.desertedVest === "UNDECIDED").length,
    totalEquityPct: round2(rows.reduce((s, d) => s + (d.deserterEquityPct ?? 0), 0)),
    totalDieselConverted: round2(rows.reduce((s, d) => s + (d.dieselConverted ?? 0), 0)),
    fullySigned: rows.filter((d) => d.swapStatus === "FULLY_SIGNED" || d.swapStatus === "CONVERTED").length,
    converted: rows.filter((d) => d.swapStatus === "CONVERTED").length,
  }
}

export interface ObligationSummary {
  count: number
  funded: number
  void: number
  totalDieselOwed: number
  totalDieselClaimable: number
  reconciled: number // funded obligations with an on-chain txid recorded
}

export function summarizeObligations(rows: OylObligationRow[]): ObligationSummary {
  const funded = rows.filter((o) => o.funding === "FUNDED")
  return {
    count: rows.length,
    funded: funded.length,
    void: rows.filter((o) => o.funding === "UNFUNDED_VOID").length,
    totalDieselOwed: round2(funded.reduce((s, o) => s + o.dieselOwed, 0)),
    totalDieselClaimable: round2(funded.reduce((s, o) => s + o.dieselClaimable, 0)),
    reconciled: funded.filter((o) => !!o.onchainTxid).length,
  }
}

/** Did Arca + Alec both sign off? Derives the swap-eligible flag for a deserter:
 *  RETAINED + both sign-offs → ready to convert. */
export function swapEligible(d: DeserterRow): boolean {
  return d.desertedVest === "RETAINED" && d.arcaSignedOff && d.alecSignedOff
}
