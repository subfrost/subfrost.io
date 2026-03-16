/**
 * API Route: Create Conference Room
 *
 * Creates a new room with a random password.
 * Returns roomId, password, and adminToken.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Room, CreateRoomResponse } from '@/lib/room-types';
import { saveRoom, generatePassword, generateToken } from '@/lib/room-utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { name, displayName, walletAddress } = body as {
      name?: string;
      displayName?: string;
      walletAddress?: string;
    };

    if (!displayName?.trim()) {
      return NextResponse.json(
        { error: 'displayName is required' },
        { status: 400 }
      );
    }

    const roomId = generateToken().slice(0, 8);
    const password = generatePassword();
    const adminToken = generateToken();
    const adminParticipantId = generateToken().slice(0, 12);

    const room: Room = {
      id: roomId,
      name: name?.trim() || 'Conference Room',
      password,
      adminToken,
      streamKey: null,
      streamSessionId: null,
      activePresenter: adminParticipantId,
      participants: {
        [adminParticipantId]: {
          id: adminParticipantId,
          displayName: displayName.trim().slice(0, 30),
          walletAddress: walletAddress?.trim() || null,
          token: adminToken,
          permissions: { mic: true, screen: true },
          isAdmin: true,
          joinedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        },
      },
      createdAt: new Date().toISOString(),
    };

    await saveRoom(room);

    const response: CreateRoomResponse = {
      roomId,
      password,
      adminToken,
      participantId: adminParticipantId,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('[Room Create] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create room' },
      { status: 500 }
    );
  }
}
