"use client"

// components/stream/CaptionOverlay.tsx
// Translucent caption overlay that renders live transcription text.
//
// Design Decisions:
// - Shows the last 3 captions for readability without overcrowding the view.
// - Language mode controls which text fields are rendered (original, translated, or both).
// - Each caption has a keyed container so React can animate new entries via CSS.
// - The semi-transparent backdrop and text-shadow ensure readability on any video content.
// - Uses a CSS animation class for fade-in of new captions.
//
// Journal:
// - 2026-02-14 (Claude): Created caption overlay component.

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { useCaptions } from "@/hooks/use-captions"
import type { CaptionLanguage } from "@/lib/stream-types"

interface CaptionOverlayProps {
  language: CaptionLanguage
  className?: string
}

export function CaptionOverlay({ language, className }: CaptionOverlayProps) {
  const { captions } = useCaptions()

  const visibleCaptions = useMemo(() => captions.slice(-3), [captions])

  if (visibleCaptions.length === 0) return null

  return (
    <div
      className={cn(
        "absolute bottom-0 left-0 right-0 flex flex-col items-center gap-1 p-4 pointer-events-none",
        className
      )}
    >
      {visibleCaptions.map((caption) => (
        <div
          key={caption.id}
          className="animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-[90%]"
        >
          <div className="rounded-md bg-black/70 px-4 py-2 backdrop-blur-sm">
            {(language === "original" || language === "both") && (
              <p
                className={cn(
                  "text-center text-sm text-white",
                  "drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                )}
              >
                {caption.textOriginal}
              </p>
            )}
            {(language === "translated" || language === "both") && caption.textTranslated && (
              <p
                className={cn(
                  "text-center text-sm",
                  language === "both"
                    ? "text-zinc-300 mt-0.5"
                    : "text-white",
                  "drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                )}
              >
                {caption.textTranslated}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
