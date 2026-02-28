"use client"

// components/stream/BroadcastControls.tsx
// Presenter controls for managing screen capture, camera, and live broadcast.
// Styled to match the broadcast-slate design system (dark navy + blue accents).
//
// Journal:
// - 2026-02-14 (Claude): Created presenter broadcast controls.
// - 2026-02-28 (Claude): Allow mid-stream source toggling, add focus section.

import React, { useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { useBroadcast, type FocusTarget } from "@/hooks/use-broadcast"
import { useAudioActivity } from "@/hooks/use-audio-activity"
import { StreamStatus } from "@/components/stream/StreamStatus"
import { Monitor, Camera, Radio, Square, Focus, Mic } from "lucide-react"

interface BroadcastControlsProps {
  streamKey: string
  className?: string
}

function StreamPreview({
  stream,
  label,
  focused,
}: {
  stream: MediaStream | null
  label: string
  focused?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (stream) {
      video.srcObject = stream
    } else {
      video.srcObject = null
    }
  }, [stream])

  return (
    <div
      className="relative overflow-hidden rounded-md aspect-video transition-all duration-300"
      style={{
        background: "rgba(0,0,0,0.5)",
        border: focused
          ? "2px solid rgba(91,156,255,0.6)"
          : "1px solid rgba(91,156,255,0.1)",
      }}
    >
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            style={{
              fontSize: 10,
              fontFamily: '"Courier New", monospace',
              color: "rgba(91,156,255,0.25)",
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            {label} OFF
          </span>
        </div>
      )}
      <div
        className="absolute top-0 left-0 px-2 py-1 rounded-br-md"
        style={{ background: "rgba(0,0,0,0.6)" }}
      >
        <span
          style={{
            fontSize: 9,
            fontFamily: '"Courier New", monospace',
            color: "rgba(91,156,255,0.6)",
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      </div>
      {focused && (
        <div
          className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded"
          style={{ background: "rgba(91,156,255,0.2)" }}
        >
          <span
            style={{
              fontSize: 8,
              fontFamily: '"Courier New", monospace',
              color: "rgba(91,156,255,0.8)",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            FOCUSED
          </span>
        </div>
      )}
    </div>
  )
}

function BroadcastButton({
  onClick,
  disabled,
  active,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2 rounded px-3 py-1.5 text-xs transition-all",
        disabled && "cursor-not-allowed opacity-40"
      )}
      style={{
        fontFamily: '"Courier New", monospace',
        letterSpacing: 2,
        textTransform: "uppercase",
        background: active
          ? "rgba(91,156,255,0.15)"
          : "rgba(91,156,255,0.04)",
        border: `1px solid ${active ? "rgba(91,156,255,0.35)" : "rgba(91,156,255,0.12)"}`,
        color: active
          ? "rgba(91,156,255,0.9)"
          : "rgba(91,156,255,0.5)",
      }}
    >
      {children}
    </button>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        style={{
          fontSize: 10,
          fontFamily: '"Courier New", monospace',
          color: "rgba(91,156,255,0.4)",
          letterSpacing: 3,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <div className="flex-1" style={{ borderBottom: "1px solid rgba(91,156,255,0.1)" }} />
    </div>
  )
}

export function BroadcastControls({ streamKey, className }: BroadcastControlsProps) {
  // Two-phase: first get camera stream, then feed audio activity back into broadcast
  const broadcastState = useBroadcast({ streamKey })
  const { isSpeaking } = useAudioActivity(broadcastState.cameraStream)

  // Wire autofocus: when isSpeaking changes and autofocus is on, update focus
  const autofocusRef = React.useRef(broadcastState.autofocus)
  autofocusRef.current = broadcastState.autofocus

  React.useEffect(() => {
    if (!autofocusRef.current || broadcastState.status !== "live") return
    const target = isSpeaking ? "camera" : "screen"
    broadcastState.setFocusTarget(target)
  }, [isSpeaking]) // eslint-disable-line react-hooks/exhaustive-deps

  const {
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
  } = broadcastState

  const isLive = status === "live"
  const isConnecting = status === "connecting"
  const hasSource = screenStream !== null || cameraStream !== null

  const focusOptions: { target: FocusTarget; label: string; icon: React.ReactNode }[] = [
    { target: "screen", label: "SCREEN", icon: <Monitor className="h-3.5 w-3.5" /> },
    { target: "camera", label: "CAMERA", icon: <Camera className="h-3.5 w-3.5" /> },
    { target: "none", label: "NONE", icon: <Focus className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className={cn("w-full space-y-5", className)}>
      {/* Sources section */}
      <SectionLabel label="SOURCES" />

      <div className="flex flex-wrap items-center gap-2">
        <BroadcastButton
          active={!!screenStream}
          onClick={screenStream ? stopScreen : startScreen}
          disabled={isConnecting}
        >
          <Monitor className="h-3.5 w-3.5" />
          {screenStream ? "STOP SCREEN" : "SHARE SCREEN"}
        </BroadcastButton>

        <BroadcastButton
          active={!!cameraStream}
          onClick={cameraStream ? stopCamera : startCamera}
          disabled={isConnecting}
        >
          <Camera className="h-3.5 w-3.5" />
          {cameraStream ? "STOP CAMERA" : "START CAMERA"}
        </BroadcastButton>

        {/* Separator */}
        <div
          className="mx-1 h-6"
          style={{ borderLeft: "1px solid rgba(91,156,255,0.15)" }}
        />

        {isLive ? (
          <button
            onClick={stopBroadcast}
            className="flex items-center gap-2 rounded px-3 py-1.5 text-xs transition-all"
            style={{
              fontFamily: '"Courier New", monospace',
              letterSpacing: 2,
              textTransform: "uppercase",
              background: "rgba(239,68,68,0.15)",
              border: "1px solid rgba(239,68,68,0.35)",
              color: "rgba(239,68,68,0.9)",
            }}
          >
            <Square className="h-3.5 w-3.5" />
            STOP BROADCAST
          </button>
        ) : (
          <button
            onClick={goLive}
            disabled={!hasSource || isConnecting}
            className={cn(
              "flex items-center gap-2 rounded px-4 py-1.5 text-xs transition-all",
              (!hasSource || isConnecting) && "cursor-not-allowed opacity-40"
            )}
            style={{
              fontFamily: '"Courier New", monospace',
              letterSpacing: 2,
              textTransform: "uppercase",
              background: hasSource
                ? "rgba(34,197,94,0.15)"
                : "rgba(34,197,94,0.05)",
              border: `1px solid ${hasSource ? "rgba(34,197,94,0.35)" : "rgba(34,197,94,0.12)"}`,
              color: hasSource
                ? "rgba(34,197,94,0.9)"
                : "rgba(34,197,94,0.3)",
            }}
          >
            <Radio className="h-3.5 w-3.5" />
            {isConnecting ? "CONNECTING..." : "GO LIVE"}
          </button>
        )}
      </div>

      {/* Focus section - only when live */}
      {isLive && (
        <>
          <SectionLabel label="FOCUS" />

          <div className="flex flex-wrap items-center gap-2">
            {focusOptions.map(({ target, label, icon }) => (
              <BroadcastButton
                key={target}
                active={focusTarget === target && !autofocus}
                onClick={() => setFocusTarget(target)}
                disabled={!isLive}
              >
                {icon}
                {label}
              </BroadcastButton>
            ))}

            <div
              className="mx-1 h-6"
              style={{ borderLeft: "1px solid rgba(91,156,255,0.15)" }}
            />

            <BroadcastButton
              active={autofocus}
              onClick={toggleAutofocus}
              disabled={!isLive}
            >
              <Mic className="h-3.5 w-3.5" />
              AUTOFOCUS
            </BroadcastButton>
          </div>
        </>
      )}

      {/* Preview section */}
      <SectionLabel label="PREVIEW" />

      <div className="grid grid-cols-2 gap-3">
        <StreamPreview
          stream={screenStream}
          label="Screen"
          focused={focusTarget === "screen"}
        />
        <StreamPreview
          stream={cameraStream}
          label="Camera"
          focused={focusTarget === "camera"}
        />
      </div>

      {/* Status bar */}
      <div
        className="flex items-center justify-between rounded px-3 py-2"
        style={{
          background: "rgba(91,156,255,0.04)",
          border: "1px solid rgba(91,156,255,0.1)",
        }}
      >
        <StreamStatus status={status === "idle" && !hasSource ? "offline" : status} />
        {error && (
          <span
            className="truncate ml-2"
            style={{
              fontSize: 10,
              fontFamily: '"Courier New", monospace',
              color: "rgba(239,68,68,0.7)",
              letterSpacing: 1,
            }}
          >
            {error}
          </span>
        )}
      </div>
    </div>
  )
}
