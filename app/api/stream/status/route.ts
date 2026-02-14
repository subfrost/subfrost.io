/**
 * API Route: Stream Status
 *
 * Returns the currently active stream session (status "live" or "created").
 * Public endpoint, no authentication required.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Find the active session (status is "live" or "created")
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
