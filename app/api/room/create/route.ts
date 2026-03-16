/**
 * API Route: Create Conference Room
 *
 * Creates a new room with a random password.
 * Supports wallet-verified creation with signature.
 * Returns roomId, password, and adminToken.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Room, CreateRoomResponse } from '@/lib/room-types';
import { saveRoom, generatePassword, generateToken } from '@/lib/room-utils';
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
      name,
      displayName,
      walletAddress,
      walletSignature,
      walletTimestamp,
      walletMessage,
    } = body as {
      name?: string;
      displayName?: string;
      walletAddress?: string;
      walletSignature?: string;
      walletTimestamp?: number;
      walletMessage?: string;
    };

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
          displayName: resolvedDisplayName.slice(0, 30),
          walletAddress: walletAddress?.trim() || null,
          walletVerified,
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

    // Non-blocking community data lookup
    if (walletVerified && walletAddress) {
      lookupCommunityData(walletAddress).then((data) => {
        if (data?.found && data.code) {
          room.participants[adminParticipantId] = {
            ...room.participants[adminParticipantId],
            ...(data.code ? { communityGroup: data.code } : {}),
          } as any;
          saveRoom(room).catch(() => {});
        }
      }).catch(() => {});
    }

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
