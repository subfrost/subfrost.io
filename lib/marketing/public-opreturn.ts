import { listOpReturnDaily } from "@/lib/marketing/opreturn-store"
import { dayValue } from "@/lib/marketing/opreturn-metrics"
import type { OpReturnRow } from "@/lib/marketing/opreturn-types"

// Public OP_RETURN chart series for /data. Chart-level aggregates only —
// source is the sampled scanner CSV ingested into OpReturnDaily (see the
// methodology note rendered next to these charts).

export interface OpReturnPoint { date: string; value: number | null }
export interface OpReturnStackedPoint { date: string; alkanes: number; rest: number }

export interface PublicOpReturnPayload {
  updatedAt: string | null
  days: number
  latestDonut: { alkanes: number; other: number } | null
  lines: {
    alkanesTxShare: OpReturnPoint[]
    alkanesOpReturnShare: OpReturnPoint[]
    dieselTxShare: OpReturnPoint[]
    opReturnBytesCum: OpReturnPoint[]
    opReturnBytesPerTx: OpReturnPoint[]
    feesTotalBtc: OpReturnPoint[]
    alkanesFeeShare: OpReturnPoint[]
  }
  feesStacked: OpReturnStackedPoint[]
}

const EMPTY: PublicOpReturnPayload = {
  updatedAt: null, days: 0, latestDonut: null,
  lines: {
    alkanesTxShare: [], alkanesOpReturnShare: [], dieselTxShare: [],
    opReturnBytesCum: [], opReturnBytesPerTx: [], feesTotalBtc: [], alkanesFeeShare: [],
  },
  feesStacked: [],
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den)

export async function getPublicOpReturnData(): Promise<PublicOpReturnPayload> {
  let rows: OpReturnRow[] = []
  try {
    rows = await listOpReturnDaily()
  } catch (e) {
    console.error("[public-opreturn] series unavailable", e)
    return EMPTY
  }
  if (rows.length === 0) return EMPTY

  let cum = 0
  const opReturnBytesCum: OpReturnPoint[] = rows.map((r) => {
    cum += r.opReturnBytes
    return { date: r.date, value: cum }
  })

  const last = rows[rows.length - 1]
  const latestDonut =
    last.txWithOpReturn === 0 ? null : { alkanes: last.txAlkanes, other: last.txWithOpReturn - last.txAlkanes }

  return {
    updatedAt: last.date,
    days: rows.length,
    latestDonut,
    lines: {
      alkanesTxShare: rows.map((r) => ({ date: r.date, value: dayValue(r, "alkanesTxShare") })),
      alkanesOpReturnShare: rows.map((r) => ({ date: r.date, value: dayValue(r, "alkanesOfOpReturnShare") })),
      dieselTxShare: rows.map((r) => ({ date: r.date, value: ratio(r.dieselMints, r.totalTx) })),
      opReturnBytesCum,
      opReturnBytesPerTx: rows.map((r) => ({ date: r.date, value: ratio(r.opReturnBytes, r.txWithOpReturn) })),
      feesTotalBtc: rows.map((r) => ({ date: r.date, value: r.feeTotalSats / 1e8 })),
      alkanesFeeShare: rows.map((r) => ({ date: r.date, value: dayValue(r, "alkanesFeeShare") })),
    },
    feesStacked: rows.map((r) => ({
      date: r.date,
      alkanes: r.feeAlkanesSats / 1e8,
      rest: (r.feeTotalSats - r.feeAlkanesSats) / 1e8,
    })),
  }
}
