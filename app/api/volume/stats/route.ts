import { NextRequest, NextResponse } from 'next/server';
import { getVolumeStats, type SourceFilter } from '@/lib/volume-data';
import { cacheGet, cacheSet } from '@/lib/redis';

const VALID_SOURCES = ['both', 'alkanes', 'brc20'];
const CACHE_TTL = 2100; // 35 minutes — kept warm by /api/prefetch

export async function GET(request: NextRequest) {
  try {
    const source = (request.nextUrl.searchParams.get('source') || 'both') as SourceFilter;
    if (!VALID_SOURCES.includes(source)) {
      return NextResponse.json({ error: 'Invalid source. Use: both, alkanes, or brc20' }, { status: 400 });
    }

    const cacheKey = `volume-stats-${source}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const stats = await getVolumeStats(source);
    await cacheSet(cacheKey, stats, CACHE_TTL);
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching volume stats:', error);
    return NextResponse.json({
      wrap_volume_sats: "0",
      unwrap_volume_sats: "0",
      total_volume_sats: "0",
      volume_24h_sats: "0",
      volume_7d_sats: "0",
    });
  }
}
