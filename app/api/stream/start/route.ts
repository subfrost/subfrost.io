/**
 * API Route: Stream Start
 *
 * Creates a new stream session with a generated stream key.
 * Requires admin authentication via Bearer token.
 */

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const STREAM_CDN_URL = 'https://stream.subfrost.io';

export async function POST(request: NextRequest) {
  try {
    // Check admin authentication
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token || token !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { title } = body as { title?: string };

    // Generate a unique stream key
    const streamKey = crypto.randomUUID();

    // Create the stream session
    const session = await prisma.streamSession.create({
      data: {
        streamKey,
        title: title || 'Live Stream',
        status: 'created',
      },
    });

    // Set HLS URLs based on the session ID
    const updatedSession = await prisma.streamSession.update({
      where: { id: session.id },
      data: {
        screenHlsUrl: `${STREAM_CDN_URL}/live/${session.id}/screen/playlist.m3u8`,
        cameraHlsUrl: `${STREAM_CDN_URL}/live/${session.id}/camera/playlist.m3u8`,
      },
    });

    return NextResponse.json(updatedSession, { status: 201 });
  } catch (error) {
    console.error('[Stream Start] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to create stream session',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
