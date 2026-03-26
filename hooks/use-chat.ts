
// hooks/use-chat.ts
// Room-scoped chat with polling. Works without a stream session.
//
// Design Decisions:
// - Polls room chat API every 2 seconds (like room status polling).
// - Uses room token for authentication.
// - Rolling buffer of 200 messages for memory efficiency.
// - Falls back to old SSE-based stream chat if no roomId provided.

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage } from '@/lib/stream-types';

interface UseChatOptions {
  roomId: string | null;
  token: string | null;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isConnected: boolean;
  sendMessage: (message: string) => Promise<boolean>;
}

const MAX_MESSAGES = 200;
const POLL_INTERVAL = 2_000;

export function useChat({ roomId, token }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const lastTimestampRef = useRef<string | null>(null);

  // Poll for new messages
  useEffect(() => {
    if (!roomId || !token) return;

    let active = true;

    async function poll() {
      try {
        const afterParam = lastTimestampRef.current
          ? `?after=${encodeURIComponent(lastTimestampRef.current)}`
          : '';
        const res = await fetch(`/api/room/${roomId}/chat${afterParam}`, {
          headers: { 'x-room-token': token! },
        });

        if (!active) return;

        if (!res.ok) {
          setIsConnected(false);
          return;
        }

        const data = await res.json();
        const newMsgs: ChatMessage[] = (data.messages || []).map((m: any) => ({
          id: m.id,
          nickname: m.displayName || 'anon',
          message: m.message,
          createdAt: m.createdAt,
          walletAddress: m.walletAddress || null,
          participantId: m.participantId || null,
        }));

        if (newMsgs.length > 0) {
          lastTimestampRef.current = newMsgs[newMsgs.length - 1].createdAt;
          setMessages((prev) => {
            const next = [...prev, ...newMsgs];
            return next.length > MAX_MESSAGES
              ? next.slice(next.length - MAX_MESSAGES)
              : next;
          });
        }

        setIsConnected(true);
      } catch {
        if (active) setIsConnected(false);
      }
    }

    // Initial fetch gets all messages (no after param)
    poll();
    const interval = setInterval(poll, POLL_INTERVAL);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [roomId, token]);

  const sendMessage = useCallback(async (message: string): Promise<boolean> => {
    if (!roomId || !token) return false;
    try {
      const res = await fetch(`/api/room/${roomId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-room-token': token,
        },
        body: JSON.stringify({ message }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [roomId, token]);

  return { messages, isConnected, sendMessage };
}
