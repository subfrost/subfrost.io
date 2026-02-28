export type StreamStatus = "created" | "live" | "ended"

export interface StreamSession {
  id: string
  streamKey: string
  title: string
  status: StreamStatus
  screenHlsUrl: string | null
  cameraHlsUrl: string | null
  startedAt: string | null
  endedAt: string | null
}

export interface StreamCaption {
  id: string
  sessionId: string
  textOriginal: string
  textTranslated: string | null
  languageFrom: string
  languageTo: string | null
  timestamp: number
  duration: number | null
}

export interface StreamStatusResponse {
  live: boolean
  session: StreamSession | null
}

export interface StartStreamResponse {
  session: StreamSession
}

export interface StopStreamResponse {
  session: StreamSession
}

export type CaptionLanguage = "original" | "translated" | "both"

export type FocusTarget = 'screen' | 'camera' | 'none'

export interface FocusState {
  target: FocusTarget
  autofocus: boolean
}

export interface ChatMessage {
  id: string
  nickname: string
  message: string
  createdAt: string
}

export interface IngestMessage {
  type: "video-chunk"
  streamKey: string
  track: "screen" | "camera"
  data: ArrayBuffer
}

export interface IngestControlMessage {
  type: "start" | "stop" | "ping"
  streamKey: string
  track?: "screen" | "camera"
}

export const STREAM_CONFIG = {
  MEDIA_SERVER_URL: process.env.NEXT_PUBLIC_MEDIA_SERVER_URL || "wss://media.subfrost.io",
  STREAM_CDN_URL: process.env.NEXT_PUBLIC_STREAM_CDN_URL || "https://stream.subfrost.io",
  HLS_SEGMENT_DURATION: 4,
  HLS_LIST_SIZE: 10,
  MEDIA_RECORDER_TIMESLICE: 1000, // send chunk every 1s
  WS_PING_INTERVAL: 30000,
  SCREEN_VIDEO_BITRATE: 2_500_000,
  CAMERA_VIDEO_BITRATE: 1_000_000,
} as const
