import { NextRequest, NextResponse } from 'next/server';
import { getVolumeCandles, type SourceFilter } from '@/lib/volume-data';

const VALID_INTERVALS = ['1d', '1w'];
const VALID_SOURCES = ['both', 'alkanes', 'brc20'];

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
    const candles = await getVolumeCandles(interval, cumulative, source);
    return NextResponse.json(candles);
  } catch (error) {
    console.error('Error fetching volume candles:', error);
    return NextResponse.json([]);
  }
}
