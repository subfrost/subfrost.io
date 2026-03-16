// lib/room-utils.ts
// Server-side room utilities for reading/writing room state from cache.

import { cacheGet, cacheSet } from '@/lib/redis';
import type { Room, RoomInfo, ParticipantInfo } from '@/lib/room-types';
import { roomCacheKey } from '@/lib/room-types';

const ROOM_TTL = 86400; // 24 hours

export async function getRoom(roomId: string): Promise<Room | null> {
  return cacheGet<Room>(roomCacheKey(roomId));
}

export async function saveRoom(room: Room): Promise<void> {
  await cacheSet(roomCacheKey(room.id), room, ROOM_TTL);
}

/**
 * Strip sensitive fields from a room for client consumption.
 */
export function toRoomInfo(room: Room): RoomInfo {
  const participants: ParticipantInfo[] = Object.values(room.participants).map((p) => ({
    id: p.id,
    displayName: p.displayName,
    walletAddress: p.walletAddress,
    walletVerified: p.walletVerified,
    communityGroup: (p as any).communityGroup || null,
    permissions: p.permissions,
    isAdmin: p.isAdmin,
    joinedAt: p.joinedAt,
  }));

  return {
    id: room.id,
    name: room.name,
    streamKey: null, // never expose stream key to general clients
    streamSessionId: room.streamSessionId,
    activePresenter: room.activePresenter,
    participants,
    createdAt: room.createdAt,
  };
}

/**
 * Strip sensitive fields but include streamKey for the active presenter.
 */
export function toRoomInfoForPresenter(room: Room, participantId: string): RoomInfo {
  const info = toRoomInfo(room);
  // Only the active presenter gets the stream key
  if (room.activePresenter === participantId && room.streamKey) {
    info.streamKey = room.streamKey;
  }
  return info;
}

/**
 * Authenticate a participant token and return the participant ID.
 * Returns null if invalid.
 */
export function authenticateParticipant(
  room: Room,
  token: string
): string | null {
  for (const [id, p] of Object.entries(room.participants)) {
    if (p.token === token) return id;
  }
  return null;
}

/**
 * Check if a participant is the admin.
 */
export function isAdmin(room: Room, participantId: string): boolean {
  return room.participants[participantId]?.isAdmin === true;
}

/**
 * Generate a random room password (6 alphanumeric characters).
 */
export function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let password = '';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) {
    password += chars[b % chars.length];
  }
  return password;
}

/**
 * Generate a random token.
 */
export function generateToken(): string {
  return crypto.randomUUID();
}
