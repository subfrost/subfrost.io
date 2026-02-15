"use client"

// components/stream/DualStreamView.tsx
// Two-panel resizable layout for simultaneous screen share and camera streams.
//
// Design Decisions:
// - Uses react-resizable-panels for a draggable divider between streams.
// - Default split is 60/40 (screen/camera) with min sizes to prevent collapse.
// - The resize handle is styled as a subtle vertical bar that highlights on hover.
// - Each panel renders a VideoPanel for independent HLS playback.
//
// Journal:
// - 2026-02-14 (Claude): Created dual-stream resizable layout component.

import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { VideoPanel } from "@/components/stream/VideoPanel"
import { cn } from "@/lib/utils"

interface DualStreamViewProps {
  screenSrc: string | null
  cameraSrc: string | null
  className?: string
}

export function DualStreamView({ screenSrc, cameraSrc, className }: DualStreamViewProps) {
  return (
    <PanelGroup
      direction="horizontal"
      className={cn("h-full w-full gap-0", className)}
    >
      {/* Screen share panel */}
      <Panel defaultSize={60} minSize={30}>
        <VideoPanel
          src={screenSrc}
          label="Screen"
          muted
          className="h-full rounded-r-none"
        />
      </Panel>

      {/* Resize handle */}
      <PanelResizeHandle
        className={cn(
          "group relative flex w-2 items-center justify-center",
          "bg-zinc-900 transition-colors hover:bg-zinc-700",
          "data-[resize-handle-active]:bg-zinc-600"
        )}
      >
        <div
          className={cn(
            "h-8 w-0.5 rounded-full bg-zinc-600 transition-colors",
            "group-hover:bg-zinc-400",
            "group-data-[resize-handle-active]:bg-zinc-300"
          )}
        />
      </PanelResizeHandle>

      {/* Camera panel */}
      <Panel defaultSize={40} minSize={20}>
        <VideoPanel
          src={cameraSrc}
          label="Camera"
          className="h-full rounded-l-none"
        />
      </Panel>
    </PanelGroup>
  )
}
