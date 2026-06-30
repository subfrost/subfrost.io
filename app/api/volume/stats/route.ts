import { NextRequest, NextResponse } from 'next/server';
import { getVolumeStats, type SourceFilter } from '@/lib/volume-data';
import { cacheGet, cacheSet } from '@/lib/redis';

const VALID_SOURCES = ['both', 'alkanes', 'brc20'];
const CACHE_TTL = 2100; // 35 minutes — kept warm by /api/prefetch
const CANONICAL_VOLUME_URL = 'https://subfrost.io/api/volume/stats';
const FETCH_TIMEOUT_MS = 10_000;

type VolumeStatsPayload = {
  wrap_24h_sats?: string | null;
  unwrap_24h_sats?: string | null;
  total_volume_sats?: string | null;
  [key: string]: unknown;
}

function has24hVolume(stats: unknown): stats is VolumeStatsPayload {
  if (!stats || typeof stats !== 'object') return false;
  const payload = stats as VolumeStatsPayload;
  return typeof payload.wrap_24h_sats === 'string' && typeof payload.unwrap_24h_sats === 'string';
}

async function fetchCanonicalVolume(request: NextRequest, source: SourceFilter) {
  const host = request.nextUrl.host.toLowerCase();
  if (host === 'subfrost.io' || host === 'www.subfrost.io') return null;

  try {
    const url = new URL(CANONICAL_VOLUME_URL);
    url.searchParams.set('source', source);
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as VolumeStatsPayload;
    return has24hVolume(payload) ? payload : null;
  } catch {
    return null;
  }
}

function shouldPreferCanonical(request: NextRequest) {
  const host = request.nextUrl.host.toLowerCase();
  return (
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    host.includes('netlify.app') ||
    host.includes('vercel.app')
  );
}

export async function GET(request: NextRequest) {
  try {
    const source = (request.nextUrl.searchParams.get('source') || 'both') as SourceFilter;
    if (!VALID_SOURCES.includes(source)) {
      return NextResponse.json({ error: 'Invalid source. Use: both, alkanes, or brc20' }, { status: 400 });
    }

    const cacheKey = `volume-stats-${source}`;
    const cached = await cacheGet(cacheKey);
    if (has24hVolume(cached)) {
      return NextResponse.json(cached);
    }

    if (shouldPreferCanonical(request)) {
      const fallback = await fetchCanonicalVolume(request, source);
      if (fallback) return NextResponse.json(fallback);
    }

    const stats = await getVolumeStats(source);
    if (has24hVolume(stats)) {
      await cacheSet(cacheKey, stats, CACHE_TTL);
      return NextResponse.json(stats);
    }

    const fallback = await fetchCanonicalVolume(request, source);
    if (fallback) return NextResponse.json(fallback);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching volume stats:', error);
    const source = (request.nextUrl.searchParams.get('source') || 'both') as SourceFilter;
    const fallback = VALID_SOURCES.includes(source) ? await fetchCanonicalVolume(request, source) : null;
    if (fallback) return NextResponse.json(fallback);

    return NextResponse.json({
      wrap_volume_sats: "0",
      unwrap_volume_sats: "0",
      total_volume_sats: "0",
      wrap_24h_sats: "0",
      unwrap_24h_sats: "0",
      wrap_7d_sats: "0",
      unwrap_7d_sats: "0",
    });
  }
}
