/**
 * API Route: Alkanes Total Unwraps
 *
 * Total BTC unwrapped on the Alkanes side. Derived from the volume-stats data
 * (canon Espo / alkanode via the Subfrost RPC) — the same source as /api/volume/*,
 * which is fast and reliably cache-warmed. The previous implementation paginated
 * the signer address's full tx history over mempool.space, which is throttled
 * from Cloud Run and routinely timed out.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { getVolumeStats, type VolumeStats } from '@/lib/volume-data';

const CACHE_KEY = 'alkanes-total-unwraps';
const VOLUME_CACHE_KEY = 'volume-stats-alkanes';
const CACHE_TTL = 2100; // 35 minutes — kept warm by /api/prefetch
let warmInFlight = false;

type UnwrapResponse = {
  totalUnwrapsSatoshis: number | null;
  totalUnwrapsBtc: number | null;
  unwrapCount: null;
  pending: boolean;
  timestamp: number;
};

function toResponse(stats: VolumeStats | null, pending: boolean): UnwrapResponse {
  const sats = stats ? Number(stats.unwrap_volume_sats || '0') : null;
  return {
    totalUnwrapsSatoshis: sats,
    totalUnwrapsBtc: sats === null ? null : sats / 1e8,
    unwrapCount: null,
    pending,
    timestamp: Date.now(),
  };
}

export async function GET() {
  try {
    const cached = await cacheGet<UnwrapResponse>(CACHE_KEY);
    if (cached) return NextResponse.json(cached);

    const warm = await cacheGet<VolumeStats>(VOLUME_CACHE_KEY);
    if (warm) {
      const result = toResponse(warm, false);
      await cacheSet(CACHE_KEY, result, CACHE_TTL);
      return NextResponse.json(result);
    }

    if (!warmInFlight) {
      warmInFlight = true;
      void getVolumeStats('alkanes')
        .then(async (resolved) => {
          await cacheSet(CACHE_KEY, toResponse(resolved, false), CACHE_TTL);
        })
        .catch(() => {})
        .finally(() => {
          warmInFlight = false;
        });
    }

    return NextResponse.json(toResponse(null, true));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error fetching Alkanes total unwraps:', errorMessage);
    return NextResponse.json({
      totalUnwrapsSatoshis: null,
      totalUnwrapsBtc: null,
      unwrapCount: null,
      timestamp: Date.now(),
      error: errorMessage,
    });
  }
}
