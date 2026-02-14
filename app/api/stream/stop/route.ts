/**
 * API Route: Stream Stop
 *
 * Ends an active stream session by setting its status to "ended".
 * Requires admin authentication via Bearer token.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    // Check admin authentication
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token || token !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { sessionId } = body as { sessionId?: string };

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    // Verify the session exists
    const existing = await prisma.streamSession.findUnique({
      where: { id: sessionId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Stream session not found' }, { status: 404 });
    }

    if (existing.status === 'ended') {
      return NextResponse.json({ error: 'Stream session already ended' }, { status: 400 });
    }

    // End the session
    const session = await prisma.streamSession.update({
      where: { id: sessionId },
      data: {
        status: 'ended',
        endedAt: new Date(),
      },
    });

    return NextResponse.json(session);
  } catch (error) {
    console.error('[Stream Stop] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to stop stream session',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
