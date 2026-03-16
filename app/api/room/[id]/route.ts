/**
 * API Route: Room Status
 *
 * GET: Returns current room state for an authenticated participant.
 * Requires X-Room-Token header.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { RoomStatusResponse } from '@/lib/room-types';
import {
  getRoom,
  saveRoom,
  toRoomInfoForPresenter,
  authenticateParticipant,
} from '@/lib/room-utils';

export async function GET(
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
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    const participantId = authenticateParticipant(room, token);
    if (!participantId) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 403 }
      );
    }

    // Update lastSeen
    room.participants[participantId].lastSeen = new Date().toISOString();
    await saveRoom(room);

    const participant = room.participants[participantId];
    const roomInfo = toRoomInfoForPresenter(room, participantId);

    const response: RoomStatusResponse = {
      room: roomInfo,
      self: {
        id: participant.id,
        displayName: participant.displayName,
        walletAddress: participant.walletAddress,
        walletVerified: participant.walletVerified,
        communityGroup: (participant as any).communityGroup || null,
        permissions: participant.permissions,
        isAdmin: participant.isAdmin,
        joinedAt: participant.joinedAt,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Room Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get room status' },
      { status: 500 }
    );
  }
}
