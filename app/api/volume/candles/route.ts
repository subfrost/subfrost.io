import { NextRequest, NextResponse } from 'next/server';
import { getVolumeCandles, type SourceFilter } from '@/lib/volume-data';
import { cacheGet, cacheSet } from '@/lib/redis';

const VALID_INTERVALS = ['1d', '1w'];
const VALID_SOURCES = ['both', 'alkanes', 'brc20'];
const CACHE_TTL = 2100; // 35 minutes — kept warm by /api/prefetch

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const interval = searchParams.get('interval') || '1d';
  const cumulative = searchParams.get('cumulative') === 'true';
  const source = (searchParams.get('source') || 'both') as SourceFilter;

  if (!VALID_INTERVALS.includes(interval)) {
    return NextResponse.json(
      { error: 'Invalid interval. Use: 1d or 1w' },
      { status: 400 }
    );
  }

  if (!VALID_SOURCES.includes(source)) {
    return NextResponse.json(
      { error: 'Invalid source. Use: both, alkanes, or brc20' },
      { status: 400 }
    );
  }

  try {
    const cacheKey = `volume-candles-${interval}-${cumulative}-${source}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const candles = await getVolumeCandles(interval, cumulative, source);
    await cacheSet(cacheKey, candles, CACHE_TTL);
    return NextResponse.json(candles);
  } catch (error) {
    console.error('Error fetching volume candles:', error);
    return NextResponse.json([]);
  }
}
