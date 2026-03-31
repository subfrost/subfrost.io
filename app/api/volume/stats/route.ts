import { NextRequest, NextResponse } from 'next/server';
import { getVolumeStats, type SourceFilter } from '@/lib/volume-data';

const VALID_SOURCES = ['both', 'alkanes', 'brc20'];

export async function GET(request: NextRequest) {
  try {
    const source = (request.nextUrl.searchParams.get('source') || 'both') as SourceFilter;
    if (!VALID_SOURCES.includes(source)) {
      return NextResponse.json({ error: 'Invalid source. Use: both, alkanes, or brc20' }, { status: 400 });
    }
    const stats = await getVolumeStats(source);
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
