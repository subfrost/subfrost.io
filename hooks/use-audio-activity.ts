
// hooks/use-audio-activity.ts
// Detects speech activity from a MediaStream using Web Audio API.
//
// Design Decisions:
// - Creates an AnalyserNode and computes RMS on each animation frame.
// - Returns isSpeaking with a 1.5s hold after audio drops below threshold
//   to prevent rapid toggling during natural speech pauses.
// - Pure client-side, no server interaction.
//
// Journal:
// - 2026-02-28 (Claude): Created for autofocus feature.

import { useState, useEffect, useRef } from 'react';

const RMS_THRESHOLD = 0.02;
const HOLD_MS = 1_500;

interface UseAudioActivityReturn {
  isSpeaking: boolean;
}

export function useAudioActivity(stream: MediaStream | null): UseAudioActivityReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const lastSpeakRef = useRef(0);

  useEffect(() => {
    if (!stream) {
      setIsSpeaking(false);
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setIsSpeaking(false);
      return;
    }

    let animId: number;
    let ctx: AudioContext;

    try {
      ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const data = new Float32Array(analyser.fftSize);

      const tick = () => {
        analyser.getFloatTimeDomainData(data);

        // Compute RMS
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          sum += data[i] * data[i];
        }
        const rms = Math.sqrt(sum / data.length);

        const now = Date.now();
        if (rms > RMS_THRESHOLD) {
          lastSpeakRef.current = now;
          setIsSpeaking(true);
        } else if (now - lastSpeakRef.current > HOLD_MS) {
          setIsSpeaking(false);
        }

        animId = requestAnimationFrame(tick);
      };

      animId = requestAnimationFrame(tick);
    } catch {
      // AudioContext not available
      return;
    }

    return () => {
      cancelAnimationFrame(animId);
      ctx.close().catch(() => {});
    };
  }, [stream]);

  return { isSpeaking };
}
