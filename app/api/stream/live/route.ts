/**
 * API Route: Stream Live
 *
 * Sets an active stream session status to "live".
 * Requires authentication via ADMIN_SECRET or STREAM_SECRET.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const validTokens = [process.env.ADMIN_SECRET, process.env.STREAM_SECRET].filter(Boolean);

    if (!token || !validTokens.includes(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { sessionId } = body as { sessionId?: string };

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const existing = await prisma.streamSession.findUnique({
      where: { id: sessionId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Stream session not found' }, { status: 404 });
    }

    const session = await prisma.streamSession.update({
      where: { id: sessionId },
      data: {
        status: 'live',
        startedAt: existing.startedAt ?? new Date(),
        endedAt: null,
      },
    });

    return NextResponse.json(session);
  } catch (error) {
    console.error('[Stream Live] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to update stream status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
