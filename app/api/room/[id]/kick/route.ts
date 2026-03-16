/**
 * API Route: Kick Participant
 *
 * POST: Admin removes a participant from the room.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
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

    const body = await request.json().catch(() => ({}));
    const { participantId } = body as { participantId?: string };

    if (!participantId || !room.participants[participantId]) {
      return NextResponse.json(
        { error: 'Participant not found' },
        { status: 404 }
      );
    }

    // Cannot kick yourself
    if (participantId === callerId) {
      return NextResponse.json(
        { error: 'Cannot kick yourself' },
        { status: 400 }
      );
    }

    // If kicking the active presenter, clear presenter
    if (room.activePresenter === participantId) {
      room.activePresenter = null;
    }

    delete room.participants[participantId];
    await saveRoom(room);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Room Kick] Error:', error);
    return NextResponse.json(
      { error: 'Failed to kick participant' },
      { status: 500 }
    );
  }
}
