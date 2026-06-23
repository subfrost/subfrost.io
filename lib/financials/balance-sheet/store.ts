// Balance-sheet store: manual line-item CRUD + computed-line assembly. The
// computed lines are derived live from the treasury snapshot (cached), open
// invoices (AR), outstanding SAFE-like instruments (a liability), and issued
// common equity. Reached only through gated actions in actions/cms/balance-sheet.ts.
import prisma from "@/lib/prisma"
import { cacheGet } from "@/lib/redis"
import type { TreasurySnapshot } from "@/lib/financials/treasury/shapes"
import {
  assembleBalanceSheet, round2,
  type BalanceSheetSection, type BalanceSheetLine, type BalanceSheetView, type ManualItemRow,
} from "./shapes"

export class BalanceSheetError extends Error {}

// Same cache keys actions/cms/financials.ts writes — read-only here, best-effort.
const TREASURY_CACHE_KEY = "financials:treasury"
const TREASURY_LAST_GOOD_KEY = "financials:treasury:last"

function mapItem(r: {
  id: string; section: string; label: string; amountUsd: number; sortOrder: number; notes: string | null
}): ManualItemRow {
  return {
    id: r.id, section: r.section as BalanceSheetSection, label: r.label,
    amountUsd: r.amountUsd, sortOrder: r.sortOrder, notes: r.notes,
  }
}

// ---------- manual items ---------------------------------------------

export async function listManualItems(): Promise<ManualItemRow[]> {
  const rows = await prisma.balanceSheetItem.findMany({ orderBy: [{ section: "asc" }, { sortOrder: "asc" }] })
  return rows.map(mapItem)
}

export async function createManualItem(input: {
  section: BalanceSheetSection; label: string; amountUsd: number; sortOrder?: number; notes?: string | null
}): Promise<ManualItemRow> {
  const label = input.label.trim()
  if (!label) throw new BalanceSheetError("Line label is required")
  if (!Number.isFinite(input.amountUsd)) throw new BalanceSheetError("Amount must be a number")
  const row = await prisma.balanceSheetItem.create({
    data: {
      section: input.section, label, amountUsd: input.amountUsd,
      sortOrder: input.sortOrder ?? 0, notes: input.notes?.trim() || null,
    },
  })
  return mapItem(row)
}

export async function updateManualItem(id: string, patch: {
  section?: BalanceSheetSection; label?: string; amountUsd?: number; sortOrder?: number; notes?: string | null
}): Promise<ManualItemRow> {
  const existing = await prisma.balanceSheetItem.findUnique({ where: { id } })
  if (!existing) throw new BalanceSheetError("Line item not found")
  const data: Record<string, unknown> = {}
  if ("section" in patch) data.section = patch.section
  if ("label" in patch) { const l = (patch.label ?? "").trim(); if (!l) throw new BalanceSheetError("Label required"); data.label = l }
  if ("amountUsd" in patch && patch.amountUsd != null) {
    if (!Number.isFinite(patch.amountUsd)) throw new BalanceSheetError("Amount must be a number")
    data.amountUsd = patch.amountUsd
  }
  if ("sortOrder" in patch) data.sortOrder = patch.sortOrder ?? 0
  if ("notes" in patch) data.notes = patch.notes?.trim() || null
  const row = await prisma.balanceSheetItem.update({ where: { id }, data })
  return mapItem(row)
}

export async function deleteManualItem(id: string): Promise<void> {
  await prisma.balanceSheetItem.delete({ where: { id } })
}

// ---------- computed lines + assembly --------------------------------

async function computedLines(): Promise<{
  lines: { section: BalanceSheetSection; line: BalanceSheetLine }[]
  treasuryStale: boolean
  treasuryAvailable: boolean
}> {
  const out: { section: BalanceSheetSection; line: BalanceSheetLine }[] = []

  // Treasury (BSC holdings) — best-effort from the same cache the treasury page
  // populates. Fresh key first, then last-good (marked stale). Never fetches.
  let treasuryStale = false
  let treasuryAvailable = false
  let snapshot = await cacheGet<TreasurySnapshot>(TREASURY_CACHE_KEY)
  if (!snapshot) {
    snapshot = await cacheGet<TreasurySnapshot>(TREASURY_LAST_GOOD_KEY)
    if (snapshot) treasuryStale = true
  }
  if (snapshot) {
    treasuryAvailable = true
    out.push({
      section: "ASSET",
      line: {
        id: "computed:treasury",
        label: "Treasury (BSC holdings)",
        amountUsd: round2(snapshot.grandTotalUsd),
        computed: true,
        note: treasuryStale ? `as of ${snapshot.fetchedAt.slice(0, 10)} (stale)` : `as of ${snapshot.fetchedAt.slice(0, 10)}`,
      },
    })
  }

  // Accounts receivable — open invoices.
  const openInvoices = await prisma.invoice.aggregate({
    where: { status: "OPEN" }, _sum: { amountUsd: true }, _count: true,
  })
  const ar = round2(openInvoices._sum.amountUsd ?? 0)
  if (ar > 0) {
    out.push({
      section: "ASSET",
      line: { id: "computed:ar", label: "Accounts receivable (open invoices)", amountUsd: ar, computed: true, note: `${openInvoices._count} open` },
    })
  }

  // Convertible instruments (SAFEs + notes) — a liability until conversion.
  const safes = await prisma.instrument.aggregate({
    where: { status: "OUTSTANDING", type: { in: ["SAFE", "CONVERTIBLE_NOTE"] } },
    _sum: { amountUsd: true }, _count: true,
  })
  const safeTotal = round2(safes._sum.amountUsd ?? 0)
  if (safeTotal > 0) {
    out.push({
      section: "LIABILITY",
      line: { id: "computed:safes", label: "Convertible instruments (SAFEs / notes)", amountUsd: safeTotal, computed: true, note: `${safes._count} outstanding` },
    })
  }

  // Common stock at par — issued common shares × par value.
  const commonClasses = await prisma.shareClass.findMany({ where: { type: "COMMON" }, select: { id: true, parValue: true } })
  if (commonClasses.length > 0) {
    const ids = commonClasses.map((c) => c.id)
    const issued = await prisma.shareHolding.aggregate({ where: { shareClassId: { in: ids } }, _sum: { shares: true } })
    const shares = issued._sum.shares ?? 0
    // Use the first common class's par value as representative (typically one common class).
    const par = commonClasses[0].parValue ?? 0
    const commonStock = round2(shares * par)
    out.push({
      section: "EQUITY",
      line: {
        id: "computed:common",
        label: "Common stock (at par)",
        amountUsd: commonStock,
        computed: true,
        note: `${shares.toLocaleString("en-US")} shares${par ? ` @ $${par}` : ""}`,
      },
    })
  }

  return { lines: out, treasuryStale, treasuryAvailable }
}

export async function buildBalanceSheet(): Promise<BalanceSheetView> {
  const [{ lines, treasuryStale, treasuryAvailable }, manual] = await Promise.all([
    computedLines(), listManualItems(),
  ])
  return assembleBalanceSheet(lines, manual, {
    asOf: new Date().toISOString(),
    treasuryStale,
    treasuryAvailable,
  })
}
