/**
 * API Route: BRC2.0 Total Unwraps
 *
 * Total BTC unwrapped on the BRC2.0 side. Derived from the volume-stats data
 * (canon Espo / alkanode via the Subfrost RPC) — the same source as /api/volume/*,
 * which is fast and reliably cache-warmed. The previous implementation paginated
 * the signer address's full tx history over mempool.space, which is throttled
 * from Cloud Run and routinely timed out.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { getVolumeStats, type VolumeStats } from '@/lib/volume-data';

const CACHE_KEY = 'brc20-total-unwraps';
const VOLUME_CACHE_KEY = 'volume-stats-brc20';
const CACHE_TTL = 2100; // 35 minutes — kept warm by /api/prefetch

export async function GET() {
  try {
    const cached = await cacheGet(CACHE_KEY);
    if (cached) return NextResponse.json(cached);

    const stats = (await cacheGet<VolumeStats>(VOLUME_CACHE_KEY)) ?? (await getVolumeStats('brc20'));
    const sats = Number(stats.unwrap_volume_sats || '0');

    const result = {
      totalUnwrapsSatoshis: sats,
      totalUnwrapsBtc: sats / 1e8,
      unwrapCount: null,
      timestamp: Date.now(),
    };

    await cacheSet(CACHE_KEY, result, CACHE_TTL);
    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error fetching BRC2.0 total unwraps:', errorMessage);
    return NextResponse.json({
      totalUnwrapsSatoshis: null,
      totalUnwrapsBtc: null,
      unwrapCount: null,
      timestamp: Date.now(),
      error: errorMessage,
    });
  }
}
