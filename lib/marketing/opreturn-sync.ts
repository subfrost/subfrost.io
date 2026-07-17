import prisma from "@/lib/prisma"
import { OPRETURN_COLUMNS, OPRETURN_OPTIONAL_COLUMNS, type OpReturnRow } from "./opreturn-types"

const PRIMARY = "https://vdto88.github.io/alkanes-opreturn-stats/history.csv"
const FALLBACK = "https://raw.githubusercontent.com/Vdto88/alkanes-opreturn-stats/main/history.csv"

export async function fetchHistoryCsv(): Promise<string> {
  for (const url of [PRIMARY, FALLBACK]) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) })
      if (res.ok) {
        const text = await res.text()
        if (text.includes("date,fromHeight") && text.includes("alkanesBytes")) return text
      }
    } catch { /* try next */ }
  }
  throw new Error("Could not fetch history.csv from the decoder dashboard")
}

// Header-based column mapping (not positional count): accepts the legacy 15-column CSV
// and the current 19-column CSV alike, and tolerates reordered/extra columns. A row
// missing any of the 15 base columns' values is skipped; the optional columns map
// ""/absent/non-finite → null (never 0) so a partial "today" row doesn't look like zero activity.
export function parseHistoryCsv(text: string): OpReturnRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const header = lines[0].split(",")
  const col = new Map(header.map((name, i) => [name, i]))
  for (const base of OPRETURN_COLUMNS) if (!col.has(base)) return [] // unknown schema: refuse all
  const out: OpReturnRow[] = []
  for (const line of lines.slice(1)) {
    const cells = line.split(",")
    const dateCell = cells[col.get("date")!]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateCell ?? "")) continue
    const row = { date: dateCell } as OpReturnRow
    let ok = true
    for (const name of OPRETURN_COLUMNS) {
      if (name === "date") continue
      const n = Number(cells[col.get(name)!])
      if (!Number.isFinite(n)) { ok = false; break }
      ;(row as unknown as Record<string, number>)[name] = n
    }
    if (!ok) continue
    for (const name of OPRETURN_OPTIONAL_COLUMNS) {
      const i = col.get(name)
      const cell = i === undefined ? "" : (cells[i] ?? "")
      const n = cell === "" ? NaN : Number(cell)
      ;(row as unknown as Record<string, number | null>)[name] = Number.isFinite(n) ? n : null
    }
    out.push(row)
  }
  return out
}

export async function syncOpReturn(): Promise<{ fetched: number; upserted: number; latestDate: string | null }> {
  const rows = parseHistoryCsv(await fetchHistoryCsv())
  let upserted = 0
  for (const r of rows) {
    const { date, ...rest } = r
    await prisma.opReturnDaily.upsert({ where: { date }, create: { date, ...rest }, update: rest })
    upserted++
  }
  const latestDate = rows.length ? rows[rows.length - 1].date : null
  return { fetched: rows.length, upserted, latestDate }
}
