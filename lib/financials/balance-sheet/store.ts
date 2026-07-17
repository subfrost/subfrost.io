// Balance-sheet store: manual line-item CRUD + computed-line assembly. The
// computed lines are derived live from the treasury snapshot (cached), open
// invoices (AR), outstanding SAFE-like instruments (a liability), and issued
// common equity. Reached only through gated actions in actions/cms/balance-sheet.ts.
import prisma from "@/lib/prisma"
import { cacheGet, cacheSet } from "@/lib/redis"
import type { TreasurySnapshot } from "@/lib/financials/treasury/shapes"
import { fetchTreasurySnapshot } from "@/lib/financials/treasury/source/live"
import { FUEL_TOTAL, FUEL_PRESALE_PROCEEDS_USD, FUEL_PRESALE_PRICE_USD } from "@/lib/fuel/supply"
import {
  assembleBalanceSheet, round2,
  type BalanceSheetSection, type BalanceSheetLine, type BalanceSheetView, type ManualItemRow,
} from "./shapes"

export class BalanceSheetError extends Error {}

// Same cache keys actions/cms/financials.ts writes. In prod there is no Redis, so
// the cache is in-memory/per-pod; the balance sheet fetches live on a miss and
// warms it, mirroring the treasury action's TTLs.
const TREASURY_CACHE_KEY = "financials:treasury"
const TREASURY_LAST_GOOD_KEY = "financials:treasury:last"
const TREASURY_TTL = 300 // 5 min
const TREASURY_LAST_GOOD_TTL = 86_400 // 24h

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
  memo: BalanceSheetLine[]
  safePreferenceUsd: number
  treasuryStale: boolean
  treasuryAvailable: boolean
}> {
  const out: { section: BalanceSheetSection; line: BalanceSheetLine }[] = []
  const memo: BalanceSheetLine[] = []

  // Treasury (BSC holdings). Fresh cache first, then last-good (stale). On a full
  // miss — expected in prod, where the cache is in-memory/per-pod with no Redis —
  // fetch live (fast/reliable via the open BSC dataseeds) and warm the cache so
  // the sheet is self-sufficient instead of depending on the treasury page being
  // visited. A provider blip just leaves treasury unavailable; the rest renders.
  let treasuryStale = false
  let treasuryAvailable = false
  let snapshot = await cacheGet<TreasurySnapshot>(TREASURY_CACHE_KEY)
  if (!snapshot) {
    snapshot = await cacheGet<TreasurySnapshot>(TREASURY_LAST_GOOD_KEY)
    if (snapshot) treasuryStale = true
  }
  if (!snapshot) {
    try {
      snapshot = await fetchTreasurySnapshot()
      await cacheSet(TREASURY_CACHE_KEY, snapshot, TREASURY_TTL)
      await cacheSet(TREASURY_LAST_GOOD_KEY, snapshot, TREASURY_LAST_GOOD_TTL)
    } catch {
      /* provider blip — treasury line omitted, rest of the sheet still renders */
    }
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

  // Deferred FUEL obligation (presale, undelivered) — the cash consideration
  // actually received for presale FUEL not yet delivered. Booked at cash
  // received, NOT marked to the presale price. Sourced from a single named
  // constant (FUEL_PRESALE_PROCEEDS_USD) pending confirmation from rwp. Always
  // shown so the line is visible even at $0 (a prompt to confirm the figure).
  const deferredFuel = round2(FUEL_PRESALE_PROCEEDS_USD)
  out.push({
    section: "LIABILITY",
    line: {
      id: "computed:deferred-fuel",
      label: "Deferred FUEL obligation (presale, undelivered)",
      amountUsd: deferredFuel,
      computed: true,
      note: "consideration received; not marked to presale price",
    },
  })

  // Convertible instruments (SAFEs / notes) — presented as a senior-to-common
  // EQUITY preference (a preference in the waterfall, not debt), NOT a liability.
  // Same OUTSTANDING SAFE/CONVERTIBLE_NOTE sum; it is part of the equity/cap
  // stack and is subtracted to get equity attributable to common.
  const safes = await prisma.instrument.aggregate({
    where: { status: "OUTSTANDING", type: { in: ["SAFE", "CONVERTIBLE_NOTE"] } },
    _sum: { amountUsd: true }, _count: true,
  })
  const safeTotal = round2(safes._sum.amountUsd ?? 0)
  if (safeTotal > 0) {
    out.push({
      section: "EQUITY",
      line: {
        id: "computed:safes",
        label: "Convertible instruments (SAFEs) — senior to common",
        amountUsd: safeTotal,
        computed: true,
        note: `${safes._count} outstanding · preference in the waterfall, not debt`,
      },
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

  // Memo — FUEL overhang (2.1M @ presale price). NOTIONAL: (FUEL_TOTAL −
  // issuedFuel) × presale price, where issuedFuel is the on-chain sum of
  // FuelAllocation.amount. This is deliberately NOT a liability (the presale
  // obligation is booked at cash received above); it is a reference figure only
  // and is excluded from every total and from the balance check.
  const issuedAgg = await prisma.fuelAllocation.aggregate({ _sum: { amount: true } })
  const issuedFuel = issuedAgg._sum.amount ?? 0
  const overhangUsd = round2(Math.max(0, FUEL_TOTAL - issuedFuel) * FUEL_PRESALE_PRICE_USD)
  memo.push({
    id: "memo:fuel-overhang",
    label: "FUEL overhang (2.1M @ presale price)",
    amountUsd: overhangUsd,
    computed: true,
    note: `notional — not a liability · (${FUEL_TOTAL.toLocaleString("en-US")} − ${issuedFuel.toLocaleString("en-US")} issued) × $${FUEL_PRESALE_PRICE_USD}`,
  })

  return { lines: out, memo, safePreferenceUsd: safeTotal, treasuryStale, treasuryAvailable }
}

export async function buildBalanceSheet(): Promise<BalanceSheetView> {
  const [{ lines, memo, safePreferenceUsd, treasuryStale, treasuryAvailable }, manual] = await Promise.all([
    computedLines(), listManualItems(),
  ])
  return assembleBalanceSheet(lines, manual, {
    asOf: new Date().toISOString(),
    treasuryStale,
    treasuryAvailable,
    memo,
    safePreferenceUsd,
  })
}
