/**
 * API Route: Room Permissions
 *
 * POST: Admin sets mic/screen permissions for a participant.
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
    const { participantId, mic, screen } = body as {
      participantId?: string;
      mic?: boolean;
      screen?: boolean;
    };

    if (!participantId || !room.participants[participantId]) {
      return NextResponse.json(
        { error: 'Participant not found' },
        { status: 404 }
      );
    }

    const participant = room.participants[participantId];

    if (typeof mic === 'boolean') {
      participant.permissions.mic = mic;
    }
    if (typeof screen === 'boolean') {
      participant.permissions.screen = screen;

      // If granting screen permission, set as active presenter
      if (screen) {
        // Revoke screen permission from previous presenter
        if (room.activePresenter && room.activePresenter !== participantId) {
          const prev = room.participants[room.activePresenter];
          if (prev) prev.permissions.screen = false;
        }
        room.activePresenter = participantId;
      } else if (room.activePresenter === participantId) {
        room.activePresenter = null;
      }
    }

    await saveRoom(room);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Room Permissions] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update permissions' },
      { status: 500 }
    );
  }
}
