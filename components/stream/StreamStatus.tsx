"use client"

// components/stream/StreamStatus.tsx
// Compact status indicator showing the current connection state as a colored dot + label.
//
// Design Decisions:
// - Uses a simple inline-flex layout for easy embedding anywhere.
// - Pulsing animation on "connecting" and "live" states draws attention.
// - Mapped from a union type to keep the API minimal and type-safe.
//
// Journal:
// - 2026-02-14 (Claude): Created stream status indicator component.

import { cn } from "@/lib/utils"

type Status = "idle" | "connecting" | "live" | "error" | "offline"

interface StreamStatusProps {
  status: Status
  className?: string
}

const statusConfig: Record<Status, { color: string; label: string; pulse: boolean }> = {
  idle: {
    color: "bg-zinc-400",
    label: "Idle",
    pulse: false,
  },
  connecting: {
    color: "bg-yellow-400",
    label: "Connecting",
    pulse: true,
  },
  live: {
    color: "bg-green-500",
    label: "Live",
    pulse: true,
  },
  error: {
    color: "bg-red-500",
    label: "Error",
    pulse: false,
  },
  offline: {
    color: "bg-zinc-500",
    label: "Offline",
    pulse: false,
  },
}

export function StreamStatus({ status, className }: StreamStatusProps) {
  const config = statusConfig[status]

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative flex h-2.5 w-2.5">
        {config.pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              config.color
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-2.5 w-2.5 rounded-full",
            config.color
          )}
        />
      </span>
      <span className="text-xs font-medium text-muted-foreground">
        {config.label}
      </span>
    </div>
  )
}
