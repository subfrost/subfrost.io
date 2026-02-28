"use client"

// components/stream/DualStreamView.tsx
// Focus-aware layout for simultaneous screen share and camera streams.
//
// Design Decisions:
// - Three layout modes based on focusTarget:
//   'none': Side-by-side 50/50 (or full width if only one stream active)
//   'screen': Screen fills viewport, camera as small PiP bottom-right
//   'camera': Camera fills viewport, screen as PiP bottom-right
// - Mobile (<lg): Always single stream only, based on focus target.
//   The secondary stream is hidden to avoid cramped dual views.
// - CSS transitions for smooth focus changes (avoids framer-motion on video).
// - PiP overlay is ~25% width with rounded corners and border.
//
// Journal:
// - 2026-02-14 (Claude): Created dual-stream resizable layout component.
// - 2026-02-28 (Claude): Rewritten for focus-aware layout with PiP overlays.
// - 2026-02-28 (Claude): Mobile optimization — single stream only on small screens.

import { VideoPanel } from "@/components/stream/VideoPanel"
import { cn } from "@/lib/utils"
import type { FocusTarget } from "@/lib/stream-types"

interface DualStreamViewProps {
  screenSrc: string | null
  cameraSrc: string | null
  focusTarget?: FocusTarget
  className?: string
}

export function DualStreamView({
  screenSrc,
  cameraSrc,
  focusTarget = "none",
  className,
}: DualStreamViewProps) {
  const hasScreen = screenSrc !== null
  const hasCamera = cameraSrc !== null
  const hasBoth = hasScreen && hasCamera

  // Single stream: always full width on all breakpoints
  if (!hasBoth) {
    return (
      <div className={cn("relative h-full w-full", className)}>
        {hasScreen && (
          <VideoPanel src={screenSrc} label="Screen" muted className="h-full w-full" />
        )}
        {hasCamera && (
          <VideoPanel src={cameraSrc} label="Camera" muted className="h-full w-full" />
        )}
        {!hasScreen && !hasCamera && (
          <div className="flex h-full w-full items-center justify-center bg-black">
            <span className="text-sm text-zinc-500">No streams available</span>
          </div>
        )}
      </div>
    )
  }

  // Focused layout: primary fills, secondary as PiP (desktop) or hidden (mobile)
  if (focusTarget === "screen" || focusTarget === "camera") {
    const isPrimaryScreen = focusTarget === "screen"

    return (
      <div className={cn("relative h-full w-full", className)}>
        {/* Primary: always full */}
        <VideoPanel
          src={isPrimaryScreen ? screenSrc : cameraSrc}
          label={isPrimaryScreen ? "Screen" : "Camera"}
          muted
          className="h-full w-full transition-all duration-500"
        />

        {/* PiP: desktop only */}
        <div
          className={cn(
            "hidden lg:block",
            "absolute bottom-4 right-4 z-10",
            "w-1/4 min-w-[180px] max-w-[320px]",
            "rounded-lg overflow-hidden shadow-2xl",
            "border border-zinc-700/50",
            "transition-all duration-500"
          )}
        >
          <VideoPanel
            src={isPrimaryScreen ? cameraSrc : screenSrc}
            label={isPrimaryScreen ? "Camera" : "Screen"}
            muted
            className="w-full"
          />
        </div>
      </div>
    )
  }

  // None: side-by-side on desktop, screen-only on mobile
  return (
    <div className={cn("flex h-full w-full gap-0 lg:gap-1", className)}>
      <div className="w-full lg:flex-1 lg:w-auto min-w-0 transition-all duration-500">
        <VideoPanel src={screenSrc} label="Screen" muted className="h-full w-full" />
      </div>
      <div className="hidden lg:block lg:flex-1 min-w-0 transition-all duration-500">
        <VideoPanel src={cameraSrc} label="Camera" muted className="h-full w-full" />
      </div>
    </div>
  )
}
