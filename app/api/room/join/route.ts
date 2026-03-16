/**
 * API Route: Join Conference Room
 *
 * Validates password and adds participant to the room.
 * Supports wallet-verified join with signature.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { JoinRoomResponse } from '@/lib/room-types';
import { getRoom, saveRoom, toRoomInfo, generateToken } from '@/lib/room-utils';
import { verifyWalletSignature } from '@/lib/wallet-verify';
import { lookupCommunityData } from '@/lib/community-bridge';

function truncateAddress(address: string): string {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      roomId,
      password,
      displayName,
      walletAddress,
      walletSignature,
      walletTimestamp,
      walletMessage,
    } = body as {
      roomId?: string;
      password?: string;
      displayName?: string;
      walletAddress?: string;
      walletSignature?: string;
      walletTimestamp?: number;
      walletMessage?: string;
    };

    if (!roomId?.trim() || !password?.trim()) {
      return NextResponse.json(
        { error: 'roomId and password are required' },
        { status: 400 }
      );
    }

    // Wallet verification
    let walletVerified = false;
    if (walletAddress && walletSignature && walletTimestamp && walletMessage) {
      walletVerified = verifyWalletSignature(walletAddress, walletMessage, walletSignature, walletTimestamp);
    }

    // Default display name to truncated address if wallet connected
    const resolvedDisplayName = displayName?.trim() || (walletAddress ? truncateAddress(walletAddress) : '');
    if (!resolvedDisplayName) {
      return NextResponse.json(
        { error: 'displayName is required (or connect a wallet)' },
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
          p.displayName = resolvedDisplayName.slice(0, 30);
          if (walletVerified) p.walletVerified = true;
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
      displayName: resolvedDisplayName.slice(0, 30),
      walletAddress: walletAddress?.trim() || null,
      walletVerified,
      token,
      permissions: { mic: false, screen: false },
      isAdmin: false,
      joinedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };

    await saveRoom(room);

    // Non-blocking community data lookup
    if (walletVerified && walletAddress) {
      lookupCommunityData(walletAddress).then((data) => {
        if (data?.found && data.code) {
          room.participants[participantId] = {
            ...room.participants[participantId],
            ...(data.code ? { communityGroup: data.code } : {}),
          } as any;
          saveRoom(room).catch(() => {});
        }
      }).catch(() => {});
    }

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
