// Client-safe schema, vocabularies, pure helpers, and the curated seed for the
// company obligation calendar. No prisma/node imports here so the manager
// component can import the labels, colors, and helpers. The Prisma-backed store
// lives in lib/compliance/obligations.ts (server-only).

import { z } from "zod"

// ---- Vocabularies -------------------------------------------------------

export const OBLIGATION_CATEGORIES = [
  "TAX", "CORPORATE", "AML_BSA", "LICENSING", "SECURITIES", "EMPLOYMENT", "DATA_PRIVACY",
] as const
export type ObligationCategory = (typeof OBLIGATION_CATEGORIES)[number]

export const CATEGORY_LABELS: Record<ObligationCategory, string> = {
  TAX: "Tax",
  CORPORATE: "Corporate",
  AML_BSA: "AML / BSA",
  LICENSING: "Licensing",
  SECURITIES: "Securities",
  EMPLOYMENT: "Employment",
  DATA_PRIVACY: "Data & privacy",
}

export const CATEGORY_CLS: Record<ObligationCategory, string> = {
  TAX: "bg-emerald-950/50 text-emerald-300 border-emerald-800/50",
  CORPORATE: "bg-blue-950/50 text-blue-300 border-blue-800/50",
  AML_BSA: "bg-violet-950/50 text-violet-300 border-violet-800/50",
  LICENSING: "bg-cyan-950/50 text-cyan-300 border-cyan-800/50",
  SECURITIES: "bg-amber-950/50 text-amber-300 border-amber-800/50",
  EMPLOYMENT: "bg-pink-950/50 text-pink-300 border-pink-800/50",
  DATA_PRIVACY: "bg-teal-950/50 text-teal-300 border-teal-800/50",
}

export const OBLIGATION_CADENCES = [
  "ONE_TIME", "ANNUAL", "BIENNIAL", "QUARTERLY", "MONTHLY", "AS_NEEDED",
] as const
export type ObligationCadence = (typeof OBLIGATION_CADENCES)[number]

export const CADENCE_LABELS: Record<ObligationCadence, string> = {
  ONE_TIME: "One-time",
  ANNUAL: "Annual",
  BIENNIAL: "Every 2 years",
  QUARTERLY: "Quarterly",
  MONTHLY: "Monthly",
  AS_NEEDED: "As needed",
}

export const OBLIGATION_STATUSES = [
  "NOT_STARTED", "IN_PROGRESS", "FILED", "COMPLETE", "BLOCKED", "NOT_APPLICABLE",
] as const
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number]

export const STATUS_LABELS: Record<ObligationStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  FILED: "Filed",
  COMPLETE: "Complete",
  BLOCKED: "Blocked",
  NOT_APPLICABLE: "N/A",
}

export const STATUS_CLS: Record<ObligationStatus, string> = {
  NOT_STARTED: "bg-zinc-800 text-zinc-400 border-zinc-700",
  IN_PROGRESS: "bg-amber-950/50 text-amber-300 border-amber-800/50",
  FILED: "bg-blue-950/50 text-blue-300 border-blue-800/50",
  COMPLETE: "bg-emerald-950/50 text-emerald-300 border-emerald-800/50",
  BLOCKED: "bg-red-950/50 text-red-300 border-red-800/50",
  NOT_APPLICABLE: "bg-zinc-800 text-zinc-500 border-zinc-700",
}

/** A status is "settled" for a cycle — it drops out of the attention math. */
export const SETTLED_STATUSES: ObligationStatus[] = ["COMPLETE", "FILED", "NOT_APPLICABLE"]

// ---- Upsert validation --------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const ObligationUpsertSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  category: z.enum(OBLIGATION_CATEGORIES),
  authority: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  cadence: z.enum(OBLIGATION_CADENCES),
  dueDate: z.string().regex(ISO_DATE, "Use YYYY-MM-DD").optional().nullable(),
  status: z.enum(OBLIGATION_STATUSES),
  owner: z.string().trim().max(120).optional().nullable(),
  lastCompletedAt: z.string().regex(ISO_DATE).optional().nullable(),
  docUrl: z.string().trim().url("Must be a URL").max(500).optional().nullable().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().nullable(),
})
export type ObligationUpsert = z.infer<typeof ObligationUpsertSchema>

// ---- Pure date + health helpers ----------------------------------------

const DAY_MS = 86_400_000
export const DUE_SOON_DAYS = 30

export type DueState = "overdue" | "due-soon" | "upcoming" | "none"

/** Parse a YYYY-MM-DD date-only string to epoch ms (UTC midnight). */
export function parseISODate(s: string | null | undefined): number | null {
  if (!s || !ISO_DATE.test(s)) return null
  const t = Date.parse(s + "T00:00:00Z")
  return Number.isNaN(t) ? null : t
}

/** Classify an obligation's urgency. Settled items never read as overdue. */
export function dueState(
  dueDate: string | null,
  status: ObligationStatus,
  nowMs: number,
): DueState {
  if (SETTLED_STATUSES.includes(status)) return "none"
  const due = parseISODate(dueDate)
  if (due == null) return "none"
  if (due < nowMs) return "overdue"
  if (due - nowMs <= DUE_SOON_DAYS * DAY_MS) return "due-soon"
  return "upcoming"
}

/** Days until (positive) or since (negative) the due date; null if no date. */
export function daysUntil(dueDate: string | null, nowMs: number): number | null {
  const due = parseISODate(dueDate)
  if (due == null) return null
  return Math.round((due - nowMs) / DAY_MS)
}

/** The next occurrence of a recurring obligation after `fromISO`. Returns null
 *  for ONE_TIME / AS_NEEDED (they don't roll forward). */
export function nextOccurrence(fromISO: string, cadence: ObligationCadence): string | null {
  const base = parseISODate(fromISO)
  if (base == null) return null
  const d = new Date(base)
  switch (cadence) {
    case "ANNUAL": d.setUTCFullYear(d.getUTCFullYear() + 1); break
    case "BIENNIAL": d.setUTCFullYear(d.getUTCFullYear() + 2); break
    case "QUARTERLY": d.setUTCMonth(d.getUTCMonth() + 3); break
    case "MONTHLY": d.setUTCMonth(d.getUTCMonth() + 1); break
    default: return null
  }
  return d.toISOString().slice(0, 10)
}

export interface ObligationHealth {
  total: number
  tracked: number // excludes NOT_APPLICABLE
  overdue: number
  dueSoon: number
  blocked: number
  inProgress: number
  settled: number
  /** 0–100 readiness: share of tracked items that are settled or on-track. */
  score: number
}

export function obligationHealth(
  rows: { dueDate: string | null; status: ObligationStatus }[],
  nowMs: number,
): ObligationHealth {
  let overdue = 0, dueSoon = 0, blocked = 0, inProgress = 0, settled = 0, tracked = 0
  for (const r of rows) {
    if (r.status === "NOT_APPLICABLE") continue
    tracked++
    if (SETTLED_STATUSES.includes(r.status)) settled++
    if (r.status === "BLOCKED") blocked++
    if (r.status === "IN_PROGRESS") inProgress++
    const st = dueState(r.dueDate, r.status, nowMs)
    if (st === "overdue") overdue++
    else if (st === "due-soon") dueSoon++
  }
  // On-track = settled, or not overdue/blocked. Score is the on-track share.
  const onTrack = tracked - overdue - blocked
  const score = tracked === 0 ? 100 : Math.round((onTrack / tracked) * 100)
  return { total: rows.length, tracked, overdue, dueSoon, blocked, inProgress, settled, score }
}

// ---- Curated seed -------------------------------------------------------
//
// A GENERIC obligation template for a Delaware C-corp operating a crypto MSB.
// This repository is PUBLIC, so the seed carries no confidential specifics — no
// identifiers, dollar amounts, names, or internal status. Everything seeds as
// NOT_STARTED with best-practice descriptions; enter the real status, dates,
// owners, notes, and evidence links through the admin UI (stored in the DB)
// after deploy. Idempotent by `key`. Keep in sync with scripts/seed-compliance.mjs.

export interface ObligationSeed {
  key: string
  title: string
  category: ObligationCategory
  authority: string
  description: string
  cadence: ObligationCadence
  dueDate: string | null
  status: ObligationStatus
  owner: string
  lastCompletedAt?: string
  notes?: string
}

export const OBLIGATION_SEED: ObligationSeed[] = [
  {
    key: "federal-1120",
    title: "Federal income tax return (Form 1120)",
    category: "TAX", authority: "IRS", cadence: "ANNUAL",
    dueDate: "2027-04-15", status: "NOT_STARTED", owner: "CPA",
    description: "Annual C-corp income tax return. Filed every year the company exists, even at a loss.",
  },
  {
    key: "federal-1120-prior-year",
    title: "Confirm the prior-year Form 1120 was filed",
    category: "TAX", authority: "IRS", cadence: "ONE_TIME",
    dueDate: "2026-08-15", status: "NOT_STARTED", owner: "CPA",
    description: "Verify the prior year's return was filed by pulling the IRS account transcript; file late if it was missed.",
  },
  {
    key: "de-franchise-tax",
    title: "Delaware franchise tax + annual report",
    category: "CORPORATE", authority: "Delaware Division of Corporations", cadence: "ANNUAL",
    dueDate: "2027-03-01", status: "NOT_STARTED", owner: "COO",
    description: "Delaware's annual franchise tax + report, due March 1. Missing it puts the company into 'void' status, which breaks good-standing certificates.",
  },
  {
    key: "msb-107-renewal",
    title: "FinCEN MSB registration renewal (Form 107)",
    category: "AML_BSA", authority: "FinCEN", cadence: "BIENNIAL",
    dueDate: "2026-12-31", status: "NOT_STARTED", owner: "CCO",
    description: "Renew the MSB registration every two years by Dec 31 of the second calendar year, and on any ownership/control change.",
  },
  {
    key: "boi-verify",
    title: "Beneficial Ownership (BOI) — verify requirement & file",
    category: "CORPORATE", authority: "FinCEN", cadence: "AS_NEEDED",
    dueDate: "2026-08-31", status: "NOT_STARTED", owner: "COO",
    description: "The Corporate Transparency Act BOI rule has shifted for domestic entities. Confirm the current requirement; file the web form if still required, else record that it was checked.",
  },
  {
    key: "form-1099-nec",
    title: "Issue 1099-NEC to contractors",
    category: "TAX", authority: "IRS", cadence: "ANNUAL",
    dueDate: "2027-01-31", status: "NOT_STARTED", owner: "COO / CPA",
    description: "Any US contractor paid $600+/yr needs a 1099-NEC by Jan 31, including crypto pay valued in USD at each payment date. Collect W-9 (US) / W-8BEN (foreign) first; export the accounting ledger's per-payment USD values as the basis.",
  },
  {
    key: "aml-program-manual",
    title: "Finalize the AML/BSA program manual",
    category: "AML_BSA", authority: "FinCEN / BSA", cadence: "ONE_TIME",
    dueDate: "2026-09-30", status: "NOT_STARTED", owner: "CCO",
    description: "Finalize the written AML program manual (CIP, OFAC screening, SAR/CTR triggers, recordkeeping) and attach it to the adopting board consent.",
  },
  {
    key: "aml-independent-review",
    title: "AML/BSA independent review",
    category: "AML_BSA", authority: "FinCEN / BSA", cadence: "ANNUAL",
    dueDate: "2026-12-31", status: "NOT_STARTED", owner: "External reviewer",
    description: "A registered MSB must have its program independently reviewed periodically. Name the reviewer and give them a scoped read-only Reviewer link.",
  },
  {
    key: "aml-training",
    title: "Annual AML/BSA staff training",
    category: "AML_BSA", authority: "FinCEN / BSA", cadence: "ANNUAL",
    dueDate: "2026-12-31", status: "NOT_STARTED", owner: "CCO",
    description: "One of the four BSA pillars. Run annual training for anyone touching regulated flows and keep attendance records.",
  },
  {
    key: "409a-valuation",
    title: "409A valuation",
    category: "SECURITIES", authority: "IRC §409A", cadence: "ANNUAL",
    dueDate: "2026-09-30", status: "NOT_STARTED", owner: "COO",
    description: "Independent appraisal of common stock FMV, needed before granting options/equity. Valid 12 months or until a material event; complete it before any new equity grant.",
  },
  {
    key: "safe-round-consent",
    title: "Ratify security issuances by board consent",
    category: "CORPORATE", authority: "Delaware / board", cadence: "ONE_TIME",
    dueDate: "2026-08-31", status: "NOT_STARTED", owner: "COO",
    description: "The board must authorize security issuances. Ratify by written board consent any instruments (e.g. SAFEs) that were executed, so the authorization is on file.",
  },
  {
    key: "ofac-screening",
    title: "OFAC sanctions rescreen of the customer base",
    category: "AML_BSA", authority: "OFAC", cadence: "MONTHLY",
    dueDate: "2026-08-01", status: "NOT_STARTED", owner: "CCO",
    description: "Rescreen verified customers against the OFAC SDN list. Run it from the KYC page; each run is recorded in the audit log.",
  },
  {
    key: "mtl-review",
    title: "State money-transmitter licensing review",
    category: "LICENSING", authority: "State regulators", cadence: "ANNUAL",
    dueDate: "2026-12-31", status: "NOT_STARTED", owner: "COO",
    description: "Review each state's money-transmission posture (agent of a licensed partner, directly licensed, exempt, or needs filing). Per-state deadlines live in the MTL tracker and surface here.",
  },
  {
    key: "entity-name-reconcile",
    title: "Reconcile entity legal name & incorporation date",
    category: "CORPORATE", authority: "Internal", cadence: "ONE_TIME",
    dueDate: "2026-08-15", status: "NOT_STARTED", owner: "COO",
    description: "Confirm the exact legal entity name and incorporation date from the Certificate of Incorporation and standardize them across all records and contracts.",
  },
  {
    key: "restricted-stock-83b",
    title: "Confirm 83(b)/vesting status on restricted stock",
    category: "SECURITIES", authority: "IRS", cadence: "ONE_TIME",
    dueDate: "2026-08-15", status: "NOT_STARTED", owner: "CPA",
    description: "For any restricted-stock purchase (RSPA), check whether shares vest over time. If they do, verify the 83(b) election was filed within 30 days of purchase.",
  },
  {
    key: "geo-ofac-app",
    title: "Verify app-level geo-blocking + OFAC screening",
    category: "AML_BSA", authority: "OFAC", cadence: "ONE_TIME",
    dueDate: "2026-09-30", status: "NOT_STARTED", owner: "COO / Eng",
    description: "Verify the app IP-blocks sanctioned jurisdictions and screens connecting wallets against OFAC lists, consistent with what the AML program commits to.",
  },
  {
    key: "privacy-tos-review",
    title: "Annual review of Terms of Service & Privacy Policy",
    category: "DATA_PRIVACY", authority: "Internal", cadence: "ANNUAL",
    dueDate: "2027-06-19", status: "NOT_STARTED", owner: "COO / counsel",
    description: "Keep the user-facing Terms and Privacy Policy current with the product and confirm the live deployment actually serves them.",
  },
  {
    key: "sales-tax-nexus",
    title: "Sales/use tax nexus review",
    category: "TAX", authority: "State regulators", cadence: "ANNUAL",
    dueDate: "2026-12-31", status: "NOT_STARTED", owner: "CPA",
    description: "Confirm no state sales/use tax registration obligations arise from the product or any physical/economic nexus. Likely low-risk but should be affirmatively checked yearly.",
  },
]
