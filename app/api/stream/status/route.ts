/**
 * API Route: Stream Status
 *
 * Returns the currently active stream session (status "live" or "created").
 * Public endpoint, no authentication required.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const streamKey = request.nextUrl.searchParams.get('streamKey');

    // If a stream key is provided, look up that specific session (any status)
    if (streamKey) {
      const session = await prisma.streamSession.findFirst({
        where: { streamKey },
        orderBy: { createdAt: 'desc' },
      });

      return NextResponse.json({
        live: session?.status === 'live',
        session,
      });
    }

    // Default: find the most recent active session
    const session = await prisma.streamSession.findFirst({
      where: {
        status: { in: ['live', 'created'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      live: session?.status === 'live',
      session,
    });
  } catch (error) {
    console.error('[Stream Status] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch stream status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
