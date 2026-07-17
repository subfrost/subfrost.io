import prisma from "@/lib/prisma"
import { OPRETURN_COLUMNS, OPRETURN_OPTIONAL_COLUMNS, type OpReturnRow } from "./opreturn-types"

type DbRow = Record<string, unknown>

function map(r: DbRow): OpReturnRow {
  const out = { date: String(r.date) } as OpReturnRow
  for (let i = 1; i < OPRETURN_COLUMNS.length; i++) {
    ;(out as unknown as Record<string, number>)[OPRETURN_COLUMNS[i]] = Number(r[OPRETURN_COLUMNS[i]])
  }
  for (const name of OPRETURN_OPTIONAL_COLUMNS) {
    const v = r[name]
    ;(out as unknown as Record<string, number | null>)[name] = v === null || v === undefined ? null : Number(v)
  }
  return out
}

export async function listOpReturnDaily(): Promise<OpReturnRow[]> {
  const rows = (await prisma.opReturnDaily.findMany({ orderBy: { date: "asc" } })) as DbRow[]
  return rows.map(map)
}

/**
 * Drops the row dated `todayUtc`, if present. The scanner's window always ends at the chain tip
 * and labels the result with today's UTC date, so today's row is necessarily partial (e.g. 42 of
 * ~144 blocks) — it's only healed into a whole day by tomorrow's dense census run. Rendering the
 * partial row lies in both directions at once: extrapolated series project a whole day off ~1/3
 * of the data, and raw (non-extrapolated) series undercount directly — UNCOMMON•GOODS mints/day
 * once read -51% on a day where the true per-block rate was actually +41%.
 *
 * Filters by DATE, not "drop the newest row": the scanner will eventually stop publishing the open
 * day at all, at which point this filter becomes a harmless no-op (no row carries today's date).
 * An unconditional drop-newest would instead start permanently hiding a real CLOSED day and lag
 * the public site by two days forever.
 */
export function dropOpenDay(rows: OpReturnRow[], todayUtc: string): OpReturnRow[] {
  return rows.filter((r) => r.date !== todayUtc)
}

/**
 * listOpReturnDaily() with the open (still-accumulating) day removed — see dropOpenDay. Every
 * public-facing consumer (the /metrics page, its OG card, and the admin stat-card studio that
 * generates cards for publishing) must read through this, never listOpReturnDaily directly, so
 * they can't disagree with each other about whether today's partial row is real. Internal/admin
 * callers (opReturnMeta, diagnostics) intentionally keep using listOpReturnDaily, since they're
 * reporting on the table's true contents, not rendering a public chart.
 */
export async function listClosedOpReturnDays(): Promise<OpReturnRow[]> {
  const todayUtc = new Date().toISOString().slice(0, 10)
  return dropOpenDay(await listOpReturnDaily(), todayUtc)
}

export async function opReturnMeta(): Promise<{ count: number; latestDate: string | null; latestUpdatedAt: Date | null }> {
  const [count, latest] = await Promise.all([
    prisma.opReturnDaily.count(),
    prisma.opReturnDaily.findFirst({ orderBy: { date: "desc" }, select: { date: true, updatedAt: true } }),
  ])
  return { count, latestDate: latest?.date ?? null, latestUpdatedAt: latest?.updatedAt ?? null }
}
