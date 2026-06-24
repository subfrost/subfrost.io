/**
 * Assemble a SnapshotPayload: per-token data live from get-alkane-details (in
 * parallel) + protocol/ratios reused from the durable home-stats store via
 * getStats(). Never throws — missing data nulls out and flips `partial`.
 */
import { getStats } from "@/lib/stats"
import { getAlkaneDetails } from "@/lib/marketing/alkane-details"
import { DIESEL_ID, FIRE_ID, FRBTC_ID, type SnapshotPayload, type SnapshotTokenBlock } from "@/lib/marketing/types"

const sum = (a: number | null, b: number | null): number | null =>
  a !== null && b !== null ? a + b : null

const blockComplete = (b: SnapshotTokenBlock): boolean =>
  b.holders !== null && b.priceUsd !== null && b.supply !== null

export async function captureSnapshot(): Promise<SnapshotPayload> {
  const [stats, diesel, fire, frbtc] = await Promise.all([
    getStats().catch(() => null),
    getAlkaneDetails(DIESEL_ID),
    getAlkaneDetails(FIRE_ID),
    getAlkaneDetails(FRBTC_ID),
  ])

  const protocol = {
    totalBtcLocked: sum(stats?.metrics.alkanesBtcLocked ?? null, stats?.metrics.brc20BtcLocked ?? null),
    alkanesBtcLocked: stats?.metrics.alkanesBtcLocked ?? null,
    brc20BtcLocked: stats?.metrics.brc20BtcLocked ?? null,
    btcUsd: stats?.marquee.btcUsd ?? null,
    btcHeight: stats?.marquee.btcHeight ?? null,
    metashrewHeight: stats?.marquee.metashrewHeight ?? null,
    source: "store" as const,
  }

  const tokens = { diesel, fire, frbtc }
  const partial =
    Object.values(protocol).some((v) => v === null) ||
    !blockComplete(diesel) || !blockComplete(fire) || !blockComplete(frbtc)

  return {
    capturedAt: new Date().toISOString(),
    protocol,
    tokens,
    ratios: { btcDiesel: stats?.marquee.btcDieselRatio ?? null, btcFire: stats?.marquee.btcFireRatio ?? null },
    partial,
  }
}
