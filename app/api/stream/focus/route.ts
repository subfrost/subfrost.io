/**
 * API Route: Stream Focus
 *
 * GET: Returns current focus state from Redis/memory cache.
 * POST: Sets focus state. Requires STREAM_SECRET or ADMIN_SECRET auth.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { prisma } from '@/lib/prisma';
import type { FocusState } from '@/lib/stream-types';

const FOCUS_TTL = 120; // seconds

export async function GET() {
  try {
    // Find the active session
    const session = await prisma.streamSession.findFirst({
      where: { status: { in: ['live', 'created'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      return NextResponse.json({ target: 'none', autofocus: false });
    }

    const cached = await cacheGet<FocusState>(`stream:focus:${session.id}`);
    return NextResponse.json(cached ?? { target: 'none', autofocus: false });
  } catch (error) {
    console.error('[Stream Focus GET] Error:', error);
    return NextResponse.json({ target: 'none', autofocus: false });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const validTokens = [process.env.ADMIN_SECRET, process.env.STREAM_SECRET].filter(Boolean);

    if (!token || !validTokens.includes(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { sessionId, target, autofocus } = body as {
      sessionId?: string;
      target?: string;
      autofocus?: boolean;
    };

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const validTargets = ['screen', 'camera', 'none'];
    const focusTarget = validTargets.includes(target ?? '') ? target! : 'none';

    const state: FocusState = {
      target: focusTarget as FocusState['target'],
      autofocus: autofocus ?? false,
    };

    await cacheSet(`stream:focus:${sessionId}`, state, FOCUS_TTL);

    return NextResponse.json(state);
  } catch (error) {
    console.error('[Stream Focus POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update focus state' },
      { status: 500 }
    );
  }
}
