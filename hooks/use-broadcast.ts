
// hooks/use-broadcast.ts
// Manages MediaRecorder + WebSocket for live broadcast ingestion.
//
// Design Decisions:
// - Supports dual streams (screen + camera) with a 1-byte binary prefix
//   so the ingest server can demux them.
// - MediaRecorder uses VP9/Opus by default, falling back to VP8/Opus.
// - A keepalive ping is sent every 30s to prevent idle WS disconnects.
// - All media tracks and connections are cleaned up on unmount or stop.
//
// Journal:
// - 2026-02-14 (Claude): Created hook for presenter broadcast management.

import { useState, useRef, useCallback, useEffect } from 'react';

type BroadcastStatus = 'idle' | 'connecting' | 'live' | 'error';

interface UseBroadcastOptions {
  streamKey: string | null;
}

interface UseBroadcastReturn {
  status: BroadcastStatus;
  screenStream: MediaStream | null;
  cameraStream: MediaStream | null;
  error: string | null;
  startScreen: () => Promise<void>;
  startCamera: () => Promise<void>;
  stopScreen: () => void;
  stopCamera: () => void;
  goLive: () => void;
  stopBroadcast: () => void;
}

const SCREEN_PREFIX = 0x01;
const CAMERA_PREFIX = 0x02;
const KEEPALIVE_INTERVAL = 30_000;
const TIMESLICE_MS = 1_000;

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

function stopAllTracks(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

function prefixChunk(prefix: number, data: Blob): Promise<Blob> {
  return data.arrayBuffer().then((buffer) => {
    const prefixed = new Uint8Array(1 + buffer.byteLength);
    prefixed[0] = prefix;
    prefixed.set(new Uint8Array(buffer), 1);
    return new Blob([prefixed]);
  });
}

export const useBroadcast = ({ streamKey }: UseBroadcastOptions): UseBroadcastReturn => {
  const [status, setStatus] = useState<BroadcastStatus>('idle');
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const statusRef = useRef<BroadcastStatus>(status);

  // Keep refs in sync with state for cleanup access
  screenStreamRef.current = screenStream;
  cameraStreamRef.current = cameraStream;
  statusRef.current = status;

  const clearKeepalive = useCallback(() => {
    if (keepaliveRef.current) {
      clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    }
  }, []);

  const stopRecorder = useCallback((recorder: MediaRecorder | null) => {
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, []);

  const startScreen = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      });
      setScreenStream(stream);
      setError(null);

      // Handle user stopping screen share via browser UI
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        setScreenStream(null);
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to capture screen'
      );
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      });
      setCameraStream(stream);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to access camera'
      );
    }
  }, []);

  const stopScreen = useCallback(() => {
    stopRecorder(screenRecorderRef.current);
    screenRecorderRef.current = null;
    stopAllTracks(screenStreamRef.current);
    setScreenStream(null);
  }, [stopRecorder]);

  const stopCamera = useCallback(() => {
    stopRecorder(cameraRecorderRef.current);
    cameraRecorderRef.current = null;
    stopAllTracks(cameraStreamRef.current);
    setCameraStream(null);
  }, [stopRecorder]);

  const stopBroadcast = useCallback(() => {
    stopRecorder(screenRecorderRef.current);
    screenRecorderRef.current = null;
    stopRecorder(cameraRecorderRef.current);
    cameraRecorderRef.current = null;
    clearKeepalive();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    stopAllTracks(screenStreamRef.current);
    stopAllTracks(cameraStreamRef.current);
    setScreenStream(null);
    setCameraStream(null);
    setStatus('idle');
    setError(null);
  }, [stopRecorder, clearKeepalive]);

  const startRecorder = useCallback(
    (stream: MediaStream, prefix: number, bitrate: number): MediaRecorder | null => {
      const mimeType = getSupportedMimeType();
      if (!mimeType) {
        setError('No supported video MIME type found');
        return null;
      }

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: bitrate,
      });

      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          const prefixedBlob = await prefixChunk(prefix, event.data);
          wsRef.current.send(prefixedBlob);
        }
      };

      recorder.onerror = () => {
        setError('MediaRecorder error');
        setStatus('error');
      };

      recorder.start(TIMESLICE_MS);
      return recorder;
    },
    []
  );

  const goLive = useCallback(() => {
    if (!streamKey) {
      setError('Stream key is required');
      return;
    }

    const currentScreen = screenStreamRef.current;
    const currentCamera = cameraStreamRef.current;

    if (!currentScreen && !currentCamera) {
      setError('No media source selected. Start screen or camera first.');
      return;
    }

    setStatus('connecting');
    setError(null);

    const wsUrl = `wss://media.subfrost.io/ingest?key=${encodeURIComponent(streamKey)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      setStatus('live');

      // Start recorders for each active stream
      if (currentScreen) {
        screenRecorderRef.current = startRecorder(
          currentScreen,
          SCREEN_PREFIX,
          2_500_000
        );
      }

      if (currentCamera) {
        cameraRecorderRef.current = startRecorder(
          currentCamera,
          CAMERA_PREFIX,
          1_000_000
        );
      }

      // Keepalive pings
      keepaliveRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(new Uint8Array([0x00])); // ping byte
        }
      }, KEEPALIVE_INTERVAL);
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
      setStatus('error');
    };

    ws.onclose = (event) => {
      clearKeepalive();
      if (statusRef.current === 'live') {
        setStatus('idle');
      }
      if (!event.wasClean) {
        setError(`Connection closed unexpectedly (code ${event.code})`);
        setStatus('error');
      }
    };
  }, [streamKey, startRecorder, clearKeepalive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecorder(screenRecorderRef.current);
      stopRecorder(cameraRecorderRef.current);
      clearKeepalive();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      stopAllTracks(screenStreamRef.current);
      stopAllTracks(cameraStreamRef.current);
    };
  }, [stopRecorder, clearKeepalive]);

  return {
    status,
    screenStream,
    cameraStream,
    error,
    startScreen,
    startCamera,
    stopScreen,
    stopCamera,
    goLive,
    stopBroadcast,
  };
};
