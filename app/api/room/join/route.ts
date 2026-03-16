/**
 * API Route: Join Conference Room
 *
 * Validates password and adds participant to the room.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { JoinRoomResponse } from '@/lib/room-types';
import { getRoom, saveRoom, toRoomInfo, generateToken } from '@/lib/room-utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { roomId, password, displayName, walletAddress } = body as {
      roomId?: string;
      password?: string;
      displayName?: string;
      walletAddress?: string;
    };

    if (!roomId?.trim() || !password?.trim()) {
      return NextResponse.json(
        { error: 'roomId and password are required' },
        { status: 400 }
      );
    }

    if (!displayName?.trim()) {
      return NextResponse.json(
        { error: 'displayName is required' },
        { status: 400 }
      );
    }

    const room = await getRoom(roomId.trim());
    if (!room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    // Validate password (case-insensitive)
    if (room.password.toUpperCase() !== password.trim().toUpperCase()) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 403 }
      );
    }

    // Check for duplicate wallet address (rejoin)
    if (walletAddress?.trim()) {
      for (const p of Object.values(room.participants)) {
        if (p.walletAddress === walletAddress.trim()) {
          // Rejoin: update lastSeen and return existing token
          p.lastSeen = new Date().toISOString();
          p.displayName = displayName.trim().slice(0, 30);
          await saveRoom(room);

          const response: JoinRoomResponse = {
            participantId: p.id,
            token: p.token,
            room: toRoomInfo(room),
          };
          return NextResponse.json(response);
        }
      }
    }

    const participantId = generateToken().slice(0, 12);
    const token = generateToken();

    room.participants[participantId] = {
      id: participantId,
      displayName: displayName.trim().slice(0, 30),
      walletAddress: walletAddress?.trim() || null,
      token,
      permissions: { mic: false, screen: false },
      isAdmin: false,
      joinedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };

    await saveRoom(room);

    const response: JoinRoomResponse = {
      participantId,
      token,
      room: toRoomInfo(room),
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('[Room Join] Error:', error);
    return NextResponse.json(
      { error: 'Failed to join room' },
      { status: 500 }
    );
  }
}
