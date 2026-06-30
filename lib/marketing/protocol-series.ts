import type { SnapshotRow } from "@/lib/marketing/snapshot-store"
import { diffSnapshots } from "@/lib/marketing/diff"

export interface SeriesPoint {
  date: string
  dieselHolders: number | null
  dieselPrice: number | null
  btcLocked: number | null
  firePrice: number | null
  frbtcSupply: number | null
  dieselMarketcap: number | null
  btcUsd: number | null
  btcDiesel: number | null
  btcFire: number | null
}

const fnum = (v: string | null): number | null => (v === null || v === "" ? null : Number(v))

export function buildProtocolSeries(rows: SnapshotRow[]): SeriesPoint[] {
  return rows.map((r) => {
    const p = r.payload
    return {
      date: r.createdAt.toISOString().slice(0, 10),
      dieselHolders: p.tokens.diesel.holders,
      dieselPrice: p.tokens.diesel.priceUsd,
      btcLocked: p.protocol.totalBtcLocked,
      firePrice: p.tokens.fire.priceUsd,
      frbtcSupply: fnum(p.tokens.frbtc.supply),
      dieselMarketcap: p.tokens.diesel.marketcapUsd,
      btcUsd: p.protocol.btcUsd,
      btcDiesel: p.ratios.btcDiesel,
      btcFire: p.ratios.btcFire,
    }
  })
}

export function pickBaseline(rows: SnapshotRow[], days: number): SnapshotRow | null {
  if (rows.length === 0) return null
  const cutoff = rows[rows.length - 1].createdAt.getTime() - days * 24 * 60 * 60 * 1000
  let chosen: SnapshotRow | null = null
  for (const r of rows) {
    if (r.createdAt.getTime() <= cutoff) chosen = r
    else break
  }
  return chosen
}

export function kpiDelta(
  rows: SnapshotRow[],
  path: string,
  days: number,
): { deltaAbs: number | null; deltaPct: number | null } {
  if (rows.length === 0) return { deltaAbs: null, deltaPct: null }
  const baseline = pickBaseline(rows, days)
  if (!baseline) return { deltaAbs: null, deltaPct: null }
  const latest = rows[rows.length - 1]
  const diff = diffSnapshots(baseline.payload, latest.payload).find((d) => d.path === path)
  return { deltaAbs: diff?.deltaAbs ?? null, deltaPct: diff?.deltaPct ?? null }
}
