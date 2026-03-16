/**
 * API Route: Start Room Stream
 *
 * POST: Admin starts a stream session for the room.
 * Creates a StreamSession and assigns the stream key.
 */

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getRoom,
  saveRoom,
  authenticateParticipant,
  isAdmin,
} from '@/lib/room-utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;
    const token = request.headers.get('x-room-token');

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const room = await getRoom(roomId);
    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    const callerId = authenticateParticipant(room, token);
    if (!callerId || !isAdmin(room, callerId)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // If stream already exists, return it
    if (room.streamSessionId && room.streamKey) {
      return NextResponse.json({
        streamSessionId: room.streamSessionId,
        streamKey: room.streamKey,
      });
    }

    // Create a new StreamSession
    const streamKey = crypto.randomUUID();
    const session = await prisma.streamSession.create({
      data: {
        streamKey,
        title: room.name,
        status: 'created',
      },
    });

    // Set HLS URLs
    await prisma.streamSession.update({
      where: { id: session.id },
      data: {
        screenHlsUrl: `/live/${session.id}/screen/playlist.m3u8`,
        cameraHlsUrl: `/live/${session.id}/camera/playlist.m3u8`,
      },
    });

    room.streamKey = streamKey;
    room.streamSessionId = session.id;

    // Auto-set the admin as the active presenter
    room.activePresenter = callerId;

    await saveRoom(room);

    return NextResponse.json({
      streamSessionId: session.id,
      streamKey,
    });
  } catch (error) {
    console.error('[Room Start Stream] Error:', error);
    return NextResponse.json(
      { error: 'Failed to start stream' },
      { status: 500 }
    );
  }
}
