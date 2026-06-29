import prisma from "@/lib/prisma"
import { OPRETURN_COLUMNS, type OpReturnRow } from "./opreturn-types"

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

// Header is fixed and values are plain numbers/ISO dates — a simple split is safe.
export function parseHistoryCsv(text: string): OpReturnRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const out: OpReturnRow[] = []
  for (const line of lines) {
    const cells = line.split(",")
    if (cells.length !== OPRETURN_COLUMNS.length) continue
    if (cells[0] === "date") continue // header
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) continue
    const row = { date: cells[0] } as OpReturnRow
    let ok = true
    for (let i = 1; i < OPRETURN_COLUMNS.length; i++) {
      const n = Number(cells[i])
      if (!Number.isFinite(n)) { ok = false; break }
      ;(row as unknown as Record<string, number>)[OPRETURN_COLUMNS[i]] = n
    }
    if (ok) out.push(row)
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
