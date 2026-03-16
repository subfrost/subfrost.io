// hooks/use-room.ts
// Manages conference room state: polling, permissions, actions.

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  RoomInfo,
  ParticipantInfo,
  RoomStatusResponse,
  CreateRoomResponse,
  JoinRoomResponse,
} from '@/lib/room-types';

const STORAGE_PREFIX = 'subfrost-room-';
const POLL_INTERVAL = 3000;

export interface WalletAuthParams {
  walletSignature: string;
  walletTimestamp: number;
  walletMessage: string;
}

interface UseRoomOptions {
  roomId: string | null;
}

interface UseRoomReturn {
  room: RoomInfo | null;
  self: ParticipantInfo | null;
  isConnected: boolean;
  error: string | null;
  isAdmin: boolean;
  isPresenter: boolean;
  // Actions
  createRoom: (name: string, displayName: string, walletAddress?: string, walletAuth?: WalletAuthParams) => Promise<CreateRoomResponse | null>;
  joinRoom: (roomId: string, password: string, displayName: string, walletAddress?: string, walletAuth?: WalletAuthParams) => Promise<JoinRoomResponse | null>;
  setPermissions: (participantId: string, mic?: boolean, screen?: boolean) => Promise<boolean>;
  kickParticipant: (participantId: string) => Promise<boolean>;
  startStream: () => Promise<{ streamSessionId: string; streamKey: string } | null>;
}

function getStoredAuth(roomId: string): { token: string; participantId: string } | null {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${roomId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setStoredAuth(roomId: string, token: string, participantId: string): void {
  sessionStorage.setItem(
    `${STORAGE_PREFIX}${roomId}`,
    JSON.stringify({ token, participantId })
  );
}

export function useRoom({ roomId }: UseRoomOptions): UseRoomReturn {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [self, setSelf] = useState<ParticipantInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  // Load stored auth on mount
  useEffect(() => {
    if (!roomId) return;
    const auth = getStoredAuth(roomId);
    if (auth) {
      tokenRef.current = auth.token;
    }
  }, [roomId]);

  // Poll room status
  useEffect(() => {
    if (!roomId || !tokenRef.current) return;

    let active = true;

    async function poll() {
      try {
        const res = await fetch(`/api/room/${roomId}`, {
          headers: { 'x-room-token': tokenRef.current! },
        });

        if (!active) return;

        if (res.status === 403 || res.status === 404) {
          setError(res.status === 403 ? 'You have been removed from the room' : 'Room not found');
          setIsConnected(false);
          return;
        }

        if (!res.ok) {
          setIsConnected(false);
          return;
        }

        const data: RoomStatusResponse = await res.json();
        setRoom(data.room);
        setSelf(data.self);
        setIsConnected(true);
        setError(null);
      } catch {
        if (active) setIsConnected(false);
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [roomId]);

  const createRoom = useCallback(
    async (name: string, displayName: string, walletAddress?: string, walletAuth?: WalletAuthParams) => {
      try {
        setError(null);
        const res = await fetch('/api/room/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, displayName, walletAddress, ...walletAuth }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || 'Failed to create room');
          return null;
        }

        const data: CreateRoomResponse = await res.json();
        tokenRef.current = data.adminToken;
        setStoredAuth(data.roomId, data.adminToken, data.participantId);
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create room');
        return null;
      }
    },
    []
  );

  const joinRoom = useCallback(
    async (joinRoomId: string, password: string, displayName: string, walletAddress?: string, walletAuth?: WalletAuthParams) => {
      try {
        setError(null);
        const res = await fetch('/api/room/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: joinRoomId,
            password,
            displayName,
            walletAddress,
            ...walletAuth,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || 'Failed to join room');
          return null;
        }

        const data: JoinRoomResponse = await res.json();
        tokenRef.current = data.token;
        setStoredAuth(joinRoomId, data.token, data.participantId);
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to join room');
        return null;
      }
    },
    []
  );

  const setPermissions = useCallback(
    async (participantId: string, mic?: boolean, screen?: boolean) => {
      if (!roomId || !tokenRef.current) return false;
      try {
        const res = await fetch(`/api/room/${roomId}/permissions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-room-token': tokenRef.current,
          },
          body: JSON.stringify({ participantId, mic, screen }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [roomId]
  );

  const kickParticipant = useCallback(
    async (participantId: string) => {
      if (!roomId || !tokenRef.current) return false;
      try {
        const res = await fetch(`/api/room/${roomId}/kick`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-room-token': tokenRef.current,
          },
          body: JSON.stringify({ participantId }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [roomId]
  );

  const startStream = useCallback(async () => {
    if (!roomId || !tokenRef.current) return null;
    try {
      const res = await fetch(`/api/room/${roomId}/start-stream`, {
        method: 'POST',
        headers: { 'x-room-token': tokenRef.current },
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }, [roomId]);

  const isAdmin = self?.isAdmin === true;
  const isPresenter =
    room?.activePresenter === self?.id && (self?.permissions.screen === true);

  return {
    room,
    self,
    isConnected,
    error,
    isAdmin,
    isPresenter,
    createRoom,
    joinRoom,
    setPermissions,
    kickParticipant,
    startStream,
  };
}
