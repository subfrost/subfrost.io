
// hooks/use-broadcast.ts
// Manages MediaRecorder + WebSocket for live broadcast ingestion.
//
// Design Decisions:
// - Supports dual streams (screen + camera) with a 1-byte binary prefix
//   so the ingest server can demux them.
// - MediaRecorder uses VP9/Opus by default, falling back to VP8/Opus.
// - A keepalive ping is sent every 30s to prevent idle WS disconnects.
// - All media tracks and connections are cleaned up on unmount or stop.
// - Sources can be started/stopped mid-stream while the WS remains open.
// - Focus control messages use 0x03 prefix with JSON payload.
//
// Journal:
// - 2026-02-14 (Claude): Created hook for presenter broadcast management.
// - 2026-02-28 (Claude): Added mid-stream source toggling, focus control, autofocus.

import { useState, useRef, useCallback, useEffect } from 'react';

export type BroadcastStatus = 'idle' | 'connecting' | 'live' | 'error';
export type FocusTarget = 'screen' | 'camera' | 'none';

interface UseBroadcastOptions {
  streamKey: string | null;
}

interface UseBroadcastReturn {
  status: BroadcastStatus;
  screenStream: MediaStream | null;
  cameraStream: MediaStream | null;
  error: string | null;
  focusTarget: FocusTarget;
  autofocus: boolean;
  startScreen: () => Promise<void>;
  startCamera: () => Promise<void>;
  stopScreen: () => void;
  stopCamera: () => void;
  goLive: () => void;
  stopBroadcast: () => void;
  setFocusTarget: (target: FocusTarget) => void;
  toggleAutofocus: () => void;
  sendControl: (msg: Record<string, unknown>) => void;
}

const SCREEN_PREFIX = 0x01;
const CAMERA_PREFIX = 0x02;
const CONTROL_PREFIX = 0x03;
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
  const [focusTarget, setFocusTargetState] = useState<FocusTarget>('none');
  const [autofocus, setAutofocus] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const statusRef = useRef<BroadcastStatus>(status);
  const autofocusRef = useRef(autofocus);

  // Keep refs in sync with state for cleanup access
  screenStreamRef.current = screenStream;
  cameraStreamRef.current = cameraStream;
  statusRef.current = status;
  autofocusRef.current = autofocus;

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

  // Send a control message over the WS (0x03 prefix + JSON)
  const sendControl = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const json = JSON.stringify(msg);
      const encoded = new TextEncoder().encode(json);
      const prefixed = new Uint8Array(1 + encoded.byteLength);
      prefixed[0] = CONTROL_PREFIX;
      prefixed.set(encoded, 1);
      wsRef.current.send(prefixed);
    }
  }, []);

  const setFocusTarget = useCallback((target: FocusTarget) => {
    setFocusTargetState(target);
    sendControl({ type: 'focus', target, autofocus: autofocusRef.current });
  }, [sendControl]);

  const toggleAutofocus = useCallback(() => {
    setAutofocus((prev) => {
      const next = !prev;
      sendControl({ type: 'focus', target: 'none', autofocus: next });
      return next;
    });
  }, [sendControl]);

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
        // Stop the recorder if we're live
        stopRecorder(screenRecorderRef.current);
        screenRecorderRef.current = null;
        setScreenStream(null);
      });

      // If already live, immediately start recording
      if (statusRef.current === 'live' && wsRef.current?.readyState === WebSocket.OPEN) {
        screenRecorderRef.current = startRecorder(stream, SCREEN_PREFIX, 2_500_000);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to capture screen'
      );
    }
  }, [startRecorder, stopRecorder]);

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

      // If already live, immediately start recording
      if (statusRef.current === 'live' && wsRef.current?.readyState === WebSocket.OPEN) {
        cameraRecorderRef.current = startRecorder(stream, CAMERA_PREFIX, 1_000_000);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to access camera'
      );
    }
  }, [startRecorder]);

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
    setFocusTargetState('none');
    setAutofocus(false);
  }, [stopRecorder, clearKeepalive]);

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
    focusTarget,
    autofocus,
    startScreen,
    startCamera,
    stopScreen,
    stopCamera,
    goLive,
    stopBroadcast,
    setFocusTarget,
    toggleAutofocus,
    sendControl,
  };
};
