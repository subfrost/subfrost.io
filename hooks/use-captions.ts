
// hooks/use-captions.ts
// Subscribes to live captions via Server-Sent Events (SSE).
//
// Design Decisions:
// - Maintains a rolling buffer of the last 50 captions for display.
// - Reconnects automatically on error with a 3-second delay.
// - Uses a monotonic counter as a fallback ID when the server doesn't
//   provide one, ensuring React keys remain stable.
//
// Journal:
// - 2026-02-14 (Claude): Created hook for live caption SSE subscription.

import { useState, useEffect, useRef, useCallback } from 'react';

interface Caption {
  id: string;
  textOriginal: string;
  textTranslated: string;
  languageFrom: string;
  languageTo: string;
  timestamp: number;
}

interface UseCaptionsReturn {
  captions: Caption[];
  isConnected: boolean;
}

const CAPTIONS_URL = '/api/stream/captions';
const MAX_CAPTIONS = 50;
const RECONNECT_DELAY = 3_000;

export const useCaptions = (): UseCaptionsReturn => {
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captionIdCounter = useRef(0);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const es = new EventSource(CAPTIONS_URL);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      clearReconnectTimer();
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const caption: Caption = {
          id: data.id ?? String(++captionIdCounter.current),
          textOriginal: data.textOriginal ?? '',
          textTranslated: data.textTranslated ?? '',
          languageFrom: data.languageFrom ?? '',
          languageTo: data.languageTo ?? '',
          timestamp: data.timestamp ?? Date.now(),
        };

        setCaptions((prev) => {
          const next = [...prev, caption];
          if (next.length > MAX_CAPTIONS) {
            return next.slice(next.length - MAX_CAPTIONS);
          }
          return next;
        });
      } catch {
        // Ignore malformed messages
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      eventSourceRef.current = null;

      // Schedule reconnection
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

  return { captions, isConnected };
};
