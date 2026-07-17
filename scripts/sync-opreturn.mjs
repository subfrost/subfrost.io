/**
 * Daily CronJob entrypoint: fetch the OP_RETURN decoder CSV and upsert into
 * OpReturnDaily. Idempotent. Run with the app image: node scripts/sync-opreturn.mjs
 */
import { PrismaClient } from "@prisma/client"

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set")

const PRIMARY = "https://vdto88.github.io/alkanes-opreturn-stats/history.csv"
const FALLBACK = "https://raw.githubusercontent.com/Vdto88/alkanes-opreturn-stats/main/history.csv"

// The 15 base columns: every row must have all of these as finite numbers (date excluded,
// checked separately) or the row is skipped entirely.
const BASE_COLS = ["date","fromHeight","toHeight","blocksScanned","totalTx","txWithOpReturn","txAlkanes","opReturnBytes","runestoneBytes","alkanesBytes","dieselMints","feeTotalSats","feeAlkanesSats","feeOpReturnSats","btcUsd"]

// Added with the 19-column CSV (2026-07). Header-mapped, not positional; missing/blank/non-finite
// cell -> null (never 0), so a partial "today" row doesn't look like zero activity.
const OPTIONAL_COLS = ["weightTotal", "weightAlkanes", "ugMints", "dieselUg"]

async function fetchHistoryCsv() {
  for (const url of [PRIMARY, FALLBACK]) {
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (res.ok) {
        const text = await res.text()
        if (text.includes("date,fromHeight") && text.includes("alkanesBytes")) return text
      }
    } catch { /* try next */ }
  }
  throw new Error("Could not fetch history.csv from either source — aborting sync")
}

// Header-based column mapping (not positional count): accepts the legacy 15-column CSV
// and the current 19-column CSV alike, and tolerates reordered/extra columns. A row
// missing any of the 15 base columns' values is skipped; the optional columns map
// ""/absent/non-finite -> null (never 0) so a partial "today" row doesn't look like zero activity.
function parseHistoryCsv(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const header = lines[0].split(",")
  const col = new Map(header.map((name, i) => [name, i]))
  for (const base of BASE_COLS) if (!col.has(base)) return [] // unknown schema: refuse all
  const out = []
  for (const line of lines.slice(1)) {
    const cells = line.split(",")
    const dateCell = cells[col.get("date")]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateCell ?? "")) continue
    const row = { date: dateCell }
    let ok = true
    for (const name of BASE_COLS) {
      if (name === "date") continue
      const n = Number(cells[col.get(name)])
      if (!Number.isFinite(n)) { ok = false; break }
      row[name] = n
    }
    if (!ok) continue
    for (const name of OPTIONAL_COLS) {
      const i = col.get(name)
      const cell = i === undefined ? "" : (cells[i] ?? "")
      const n = cell === "" ? NaN : Number(cell)
      row[name] = Number.isFinite(n) ? n : null
    }
    out.push(row)
  }
  return out
}

const prisma = new PrismaClient()
try {
  const text = await fetchHistoryCsv()
  const rows = parseHistoryCsv(text)
  let n = 0
  for (const { date, ...data } of rows) {
    await prisma.opReturnDaily.upsert({ where: { date }, create: { date, ...data }, update: data })
    n++
  }
  console.log(`[sync-opreturn] upserted ${n} day(s)`)
} finally {
  await prisma.$disconnect()
}
