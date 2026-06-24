/**
 * Unified home statistics endpoint.
 *
 * Returns the entire home stat set (metrics + marquee) in one call, assembled
 * from the durable HomeStat store (kept warm by /api/prefetch). Store-only —
 * never calls the live cascade in the request path. This is what the home SSR
 * reads and what the client (MetricsBoxes + the marquee) fetches.
 */
import { NextResponse } from 'next/server'
import { getStats } from '@/lib/stats'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await getStats())
}
