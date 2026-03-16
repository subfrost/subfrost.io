// lib/room-types.ts
// Types for the conference room system.

export interface ParticipantPermissions {
  mic: boolean;
  screen: boolean;
}

export interface Participant {
  id: string;
  displayName: string;
  walletAddress: string | null;
  walletVerified: boolean;
  token: string;
  permissions: ParticipantPermissions;
  isAdmin: boolean;
  joinedAt: string;
  lastSeen: string;
}

export interface Room {
  id: string;
  name: string;
  password: string;
  adminToken: string;
  streamKey: string | null;
  streamSessionId: string | null;
  activePresenter: string | null; // participantId of current presenter
  participants: Record<string, Participant>;
  createdAt: string;
}

// Client-safe room info (no tokens, no password)
export interface RoomInfo {
  id: string;
  name: string;
  streamKey: string | null;
  streamSessionId: string | null;
  activePresenter: string | null;
  participants: ParticipantInfo[];
  createdAt: string;
}

export interface ParticipantInfo {
  id: string;
  displayName: string;
  walletAddress: string | null;
  walletVerified: boolean;
  communityGroup?: string | null;
  permissions: ParticipantPermissions;
  isAdmin: boolean;
  joinedAt: string;
}

export interface CreateRoomResponse {
  roomId: string;
  password: string;
  adminToken: string;
  participantId: string;
}

export interface JoinRoomResponse {
  participantId: string;
  token: string;
  room: RoomInfo;
}

export interface RoomStatusResponse {
  room: RoomInfo;
  self: ParticipantInfo;
}

// Cache key helpers
export function roomCacheKey(roomId: string): string {
  return `room:${roomId}`;
}
