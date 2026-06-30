import { NextRequest, NextResponse } from 'next/server';
import { getVolumeCandles, type SourceFilter } from '@/lib/volume-data';
import { cacheGet, cacheSet } from '@/lib/redis';

const VALID_INTERVALS = ['1d', '1w'];
const VALID_SOURCES = ['both', 'alkanes', 'brc20'];
const CACHE_TTL = 2100; // 35 minutes — kept warm by /api/prefetch
const CANONICAL_VOLUME_URL = 'https://subfrost.io/api/volume/candles';
const FETCH_TIMEOUT_MS = 10_000;

type CandlePayload = Array<{
  bucket?: string | null;
  wrap_sats?: string | null;
  unwrap_sats?: string | null;
  [key: string]: unknown;
}>;

function hasCandleRows(candles: unknown): candles is CandlePayload {
  return Array.isArray(candles) && candles.length > 0 && candles.some((row) => (
    row &&
    typeof row === 'object' &&
    typeof row.bucket === 'string' &&
    typeof row.wrap_sats === 'string' &&
    typeof row.unwrap_sats === 'string'
  ));
}

function shouldPreferCanonical(request: NextRequest) {
  const host = request.nextUrl.host.toLowerCase();
  return host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.includes('netlify.app');
}

async function fetchCanonicalCandles(
  request: NextRequest,
  interval: string,
  cumulative: boolean,
  source: SourceFilter,
) {
  const host = request.nextUrl.host.toLowerCase();
  if (host === 'subfrost.io' || host === 'www.subfrost.io') return null;

  try {
    const url = new URL(CANONICAL_VOLUME_URL);
    url.searchParams.set('interval', interval);
    url.searchParams.set('cumulative', String(cumulative));
    url.searchParams.set('source', source);
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return hasCandleRows(payload) ? payload : null;
  } catch {
    return null;
  }
}

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
    if (hasCandleRows(cached)) {
      return NextResponse.json(cached);
    }

    if (shouldPreferCanonical(request)) {
      const fallback = await fetchCanonicalCandles(request, interval, cumulative, source);
      if (fallback) return NextResponse.json(fallback);
    }

    const candles = await getVolumeCandles(interval, cumulative, source);
    if (hasCandleRows(candles)) {
      await cacheSet(cacheKey, candles, CACHE_TTL);
      return NextResponse.json(candles);
    }

    const fallback = await fetchCanonicalCandles(request, interval, cumulative, source);
    if (fallback) return NextResponse.json(fallback);

    return NextResponse.json(candles);
  } catch (error) {
    console.error('Error fetching volume candles:', error);
    const fallback = await fetchCanonicalCandles(request, interval, cumulative, source);
    if (fallback) return NextResponse.json(fallback);

    return NextResponse.json([]);
  }
}
