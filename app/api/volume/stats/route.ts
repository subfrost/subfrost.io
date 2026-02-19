import { NextResponse } from 'next/server';
import { getVolumeStats } from '@/lib/volume-data';

export async function GET() {
  try {
    const stats = await getVolumeStats();
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
