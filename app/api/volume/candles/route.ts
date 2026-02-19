import { NextRequest, NextResponse } from 'next/server';
import { getVolumeCandles } from '@/lib/volume-data';

const VALID_INTERVALS = ['1d', '1w'];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const interval = searchParams.get('interval') || '1d';
  const cumulative = searchParams.get('cumulative') === 'true';

  if (!VALID_INTERVALS.includes(interval)) {
    return NextResponse.json(
      { error: 'Invalid interval. Use: 1d or 1w' },
      { status: 400 }
    );
  }

  try {
    const candles = await getVolumeCandles(interval, cumulative);
    return NextResponse.json(candles);
  } catch (error) {
    console.error('Error fetching volume candles:', error);
    return NextResponse.json([]);
  }
}
