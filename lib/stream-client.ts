import type Hls from "hls.js"
import { STREAM_CONFIG } from "./stream-types"

export function getHlsConfig(): Partial<Hls["config"]> {
  return {
    enableWorker: true,
    lowLatencyMode: true,
    backBufferLength: 30,
    maxBufferLength: 10,
    maxMaxBufferLength: 20,
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 6,
    liveDurationInfinity: true,
  }
}

export function getScreenHlsUrl(sessionId: string): string {
  return `${STREAM_CONFIG.STREAM_CDN_URL}/live/${sessionId}/screen/playlist.m3u8`
}

export function getCameraHlsUrl(sessionId: string): string {
  return `${STREAM_CONFIG.STREAM_CDN_URL}/live/${sessionId}/camera/playlist.m3u8`
}

export function createIngestWebSocket(streamKey: string): WebSocket {
  const url = `${STREAM_CONFIG.MEDIA_SERVER_URL}/ingest?streamKey=${encodeURIComponent(streamKey)}`
  return new WebSocket(url)
}

export async function captureScreen(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
    },
    audio: true,
  })
}

export async function captureCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
    audio: true,
  })
}

export function createMediaRecorder(
  stream: MediaStream,
  bitrate: number,
): MediaRecorder {
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : "video/webm"

  return new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: bitrate,
  })
}
