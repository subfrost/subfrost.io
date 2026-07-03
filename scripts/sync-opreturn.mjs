/**
 * Daily CronJob entrypoint: fetch the OP_RETURN decoder CSV and upsert into
 * OpReturnDaily. Idempotent. Run with the app image: node scripts/sync-opreturn.mjs
 */
import { PrismaClient } from "@prisma/client"

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set")

const PRIMARY = "https://vdto88.github.io/alkanes-opreturn-stats/history.csv"
const FALLBACK = "https://raw.githubusercontent.com/Vdto88/alkanes-opreturn-stats/main/history.csv"
const COLS = ["date","fromHeight","toHeight","blocksScanned","totalTx","txWithOpReturn","txAlkanes","opReturnBytes","runestoneBytes","alkanesBytes","dieselMints","feeTotalSats","feeAlkanesSats","feeOpReturnSats","btcUsd"]

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

const prisma = new PrismaClient()
try {
  const text = await fetchHistoryCsv()
  let n = 0
  for (const line of text.split(/\r?\n/)) {
    const cells = line.trim().split(",")
    if (cells.length !== COLS.length || !/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) continue
    const data = {}
    let ok = true
    for (let i = 1; i < COLS.length; i++) { const v = Number(cells[i]); if (!Number.isFinite(v)) { ok = false; break } data[COLS[i]] = v }
    if (!ok) continue
    await prisma.opReturnDaily.upsert({ where: { date: cells[0] }, create: { date: cells[0], ...data }, update: data })
    n++
  }
  console.log(`[sync-opreturn] upserted ${n} day(s)`)
} finally {
  await prisma.$disconnect()
}
