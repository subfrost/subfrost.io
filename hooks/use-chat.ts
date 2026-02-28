
// hooks/use-chat.ts
// SSE subscription for live chat messages, following the use-captions.ts pattern.
//
// Design Decisions:
// - Rolling buffer of 200 messages to keep memory bounded.
// - Auto-reconnects on error with 3s delay.
// - sendMessage POSTs to the chat API.
//
// Journal:
// - 2026-02-28 (Claude): Created for live chat feature.

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage } from '@/lib/stream-types';

interface UseChatReturn {
  messages: ChatMessage[];
  isConnected: boolean;
  sendMessage: (nickname: string, message: string) => Promise<boolean>;
}

const CHAT_URL = '/api/stream/chat';
const MAX_MESSAGES = 200;
const RECONNECT_DELAY = 3_000;

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgIdCounter = useRef(0);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const es = new EventSource(CHAT_URL);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      clearReconnectTimer();
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Skip control messages
        if (data.type === 'stream_ended' || data.error) return;

        const msg: ChatMessage = {
          id: data.id ?? String(++msgIdCounter.current),
          nickname: data.nickname ?? 'anon',
          message: data.message ?? '',
          createdAt: data.createdAt ?? new Date().toISOString(),
        };

        setMessages((prev) => {
          const next = [...prev, msg];
          return next.length > MAX_MESSAGES
            ? next.slice(next.length - MAX_MESSAGES)
            : next;
        });
      } catch {
        // Ignore malformed messages
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      eventSourceRef.current = null;

      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, RECONNECT_DELAY);
    };
  }, [clearReconnectTimer]);

  useEffect(() => {
    connect();

    return () => {
      clearReconnectTimer();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect, clearReconnectTimer]);

  const sendMessage = useCallback(async (nickname: string, message: string): Promise<boolean> => {
    try {
      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, message }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  return { messages, isConnected, sendMessage };
}
