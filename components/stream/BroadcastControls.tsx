"use client"

// components/stream/BroadcastControls.tsx
// Presenter controls for managing screen capture, camera, and live broadcast.
//
// Design Decisions:
// - Wraps useBroadcast to provide a full control panel in a Card layout.
// - Toggle buttons reflect active state: outlined when off, filled when on.
// - "Go Live" is disabled until at least one source (screen or camera) is active.
// - Preview videos use srcObject to display local MediaStream without HLS.
// - The status indicator at the bottom shows connection state via StreamStatus.
//
// Journal:
// - 2026-02-14 (Claude): Created broadcast controls panel component.

import { useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { useBroadcast } from "@/hooks/use-broadcast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { StreamStatus } from "@/components/stream/StreamStatus"
import { Monitor, Camera, Radio, Square } from "lucide-react"

interface BroadcastControlsProps {
  streamKey: string
  className?: string
}

function StreamPreview({
  stream,
  label,
}: {
  stream: MediaStream | null
  label: string
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
    <div className="relative bg-black rounded-md overflow-hidden aspect-video">
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
          <span className="text-xs text-zinc-500">{label} off</span>
        </div>
      )}
      <div className="absolute top-0 left-0 bg-black/50 px-1.5 py-0.5 rounded-br-md">
        <span className="text-[10px] font-medium text-white/80">{label}</span>
      </div>
    </div>
  )
}

export function BroadcastControls({ streamKey, className }: BroadcastControlsProps) {
  const {
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
  } = useBroadcast({ streamKey })

  const isLive = status === "live"
  const isConnecting = status === "connecting"
  const hasSource = screenStream !== null || cameraStream !== null

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Broadcast Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Source controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={screenStream ? "default" : "outline"}
            size="sm"
            onClick={screenStream ? stopScreen : startScreen}
            disabled={isLive || isConnecting}
          >
            <Monitor className="h-4 w-4" />
            {screenStream ? "Stop Screen" : "Share Screen"}
          </Button>

          <Button
            variant={cameraStream ? "default" : "outline"}
            size="sm"
            onClick={cameraStream ? stopCamera : startCamera}
            disabled={isLive || isConnecting}
          >
            <Camera className="h-4 w-4" />
            {cameraStream ? "Stop Camera" : "Start Camera"}
          </Button>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {isLive ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={stopBroadcast}
            >
              <Square className="h-4 w-4" />
              Stop Broadcast
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={goLive}
              disabled={!hasSource || isConnecting}
              className={cn(
                "bg-green-600 text-white hover:bg-green-700",
                "disabled:bg-green-600/50"
              )}
            >
              <Radio className="h-4 w-4" />
              {isConnecting ? "Connecting..." : "Go Live"}
            </Button>
          )}
        </div>

        {/* Preview */}
        <div className="grid grid-cols-2 gap-2">
          <StreamPreview stream={screenStream} label="Screen" />
          <StreamPreview stream={cameraStream} label="Camera" />
        </div>

        {/* Status and error */}
        <div className="flex items-center justify-between">
          <StreamStatus status={status === "idle" && !hasSource ? "offline" : status} />
          {error && (
            <span className="text-xs text-red-400 truncate ml-2">{error}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
