"use client"

// components/stream/VideoPanel.tsx
// Video player panel that wraps the useStream hook for HLS playback.
//
// Design Decisions:
// - Uses a ref-based video element with the useStream hook for HLS.js management.
// - Shows three distinct states: loading (skeleton), error, and offline (no src).
// - The label overlay uses a gradient backdrop to remain readable on any content.
// - Autoplay and playsInline are always set for live stream UX.
//
// Journal:
// - 2026-02-14 (Claude): Created video player wrapper component.

import { useRef } from "react"
import { cn } from "@/lib/utils"
import { useStream } from "@/hooks/use-stream"
import { Skeleton } from "@/components/ui/skeleton"

interface VideoPanelProps {
  src: string | null
  label: string
  muted?: boolean
  className?: string
}

export function VideoPanel({ src, label, muted = false, className }: VideoPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const { isLoading, error } = useStream({ src, videoRef })

  return (
    <div
      className={cn(
        "relative bg-black rounded-lg overflow-hidden aspect-video",
        className
      )}
    >
      {/* Loading skeleton */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Skeleton className="h-full w-full rounded-none bg-zinc-800" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-500 border-t-white" />
              <span className="text-xs text-zinc-400">Loading stream...</span>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/80">
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-red-400 text-lg">!</span>
            </div>
            <span className="text-sm text-red-400">{error}</span>
          </div>
        </div>
      )}

      {/* Offline placeholder */}
      {src === null && !isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center">
              <div className="h-4 w-4 rounded-full bg-zinc-600" />
            </div>
            <span className="text-sm text-zinc-500">Stream offline</span>
          </div>
        </div>
      )}

      {/* Video element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="h-full w-full object-contain"
      />

      {/* Label overlay */}
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-2 pointer-events-none">
        <span className="text-xs font-medium text-white/90 drop-shadow-sm">
          {label}
        </span>
      </div>
    </div>
  )
}
