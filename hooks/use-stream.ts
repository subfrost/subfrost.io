
// hooks/use-stream.ts
// Manages HLS.js lifecycle for video playback with low-latency configuration.
//
// Design Decisions:
// - HLS.js is dynamically imported to avoid SSR issues (it requires `window`).
// - Falls back to native HLS for Safari, which has built-in support.
// - Low-latency config is tuned for live streaming with minimal delay.
// - The Hls instance is destroyed and recreated when the src changes.
//
// Journal:
// - 2026-02-14 (Claude): Created hook for HLS.js video stream management.

import { useState, useEffect, useRef, useCallback } from 'react';
import type { RefObject } from 'react';

interface UseStreamOptions {
  src: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}

interface UseStreamReturn {
  isLoading: boolean;
  error: string | null;
}

const HLS_CONFIG = {
  enableWorker: true,
  lowLatencyMode: true,
  backBufferLength: 30,
  maxBufferLength: 10,
  maxMaxBufferLength: 20,
  liveSyncDurationCount: 3,
  liveMaxLatencyDurationCount: 6,
  liveDurationInfinity: true,
};

export const useStream = ({ src, videoRef }: UseStreamOptions): UseStreamReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hlsRef = useRef<any>(null);

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) {
      destroyHls();
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const initHls = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { default: Hls } = await import('hls.js');

        if (cancelled) return;

        if (Hls.isSupported()) {
          destroyHls();

          const hls = new Hls(HLS_CONFIG);
          hlsRef.current = hls;

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!cancelled) {
              setIsLoading(false);
              video.play().catch(() => {
                // Autoplay may be blocked by browser policy; ignore.
              });
            }
          });

          hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
            if (cancelled) return;

            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  setError('Network error: unable to load stream');
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  setError('Media error: attempting recovery');
                  hls.recoverMediaError();
                  break;
                default:
                  setError(`Fatal stream error: ${data.details}`);
                  destroyHls();
                  break;
              }
            }
          });

          hls.loadSource(src);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari native HLS support
          video.src = src;
          video.addEventListener(
            'loadedmetadata',
            () => {
              if (!cancelled) {
                setIsLoading(false);
                video.play().catch(() => {
                  // Autoplay may be blocked by browser policy; ignore.
                });
              }
            },
            { once: true }
          );
          video.addEventListener(
            'error',
            () => {
              if (!cancelled) {
                setError('Failed to load stream via native HLS');
                setIsLoading(false);
              }
            },
            { once: true }
          );
        } else {
          setError('HLS is not supported in this browser');
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load HLS.js library');
          setIsLoading(false);
        }
      }
    };

    initHls();

    return () => {
      cancelled = true;
      destroyHls();
    };
  }, [src, videoRef, destroyHls]);

  return { isLoading, error };
};
