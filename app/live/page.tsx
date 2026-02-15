"use client"

import { useState, useCallback, useRef } from "react"
import useSWR from "swr"
import { DualStreamView } from "@/components/stream/DualStreamView"
import { CaptionOverlay } from "@/components/stream/CaptionOverlay"
import { LanguageToggle } from "@/components/stream/LanguageToggle"
import { StreamOffline } from "@/components/stream/StreamOffline"
import { Button } from "@/components/ui/button"
import { Maximize } from "lucide-react"
import type { CaptionLanguage, StreamStatusResponse } from "@/lib/stream-types"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function LivePage() {
  const [captionLang, setCaptionLang] = useState<CaptionLanguage>("original")
  const containerRef = useRef<HTMLDivElement | null>(null)

  const { data, isLoading } = useSWR<StreamStatusResponse>(
    "/api/stream/status",
    fetcher,
    { refreshInterval: 10_000 }
  )

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return

    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      el.requestFullscreen()
    }
  }, [])

  const isLive = data?.live === true && data.session !== null
  const session = data?.session ?? null

  // Loading or offline state
  if (isLoading || !isLive || !session) {
    return <StreamOffline />
  }

  // Live state
  return (
    <div className="flex min-h-screen flex-col bg-black">
      {/* Title bar */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-3">
          {/* Live indicator dot */}
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
          <h1 className="text-lg font-semibold text-white">
            {session.title || "Live Stream"}
          </h1>
        </div>
      </header>

      {/* Video area */}
      <main className="relative flex-1" ref={containerRef}>
        {/* Dual stream view */}
        <DualStreamView
          screenSrc={session.screenHlsUrl}
          cameraSrc={session.cameraHlsUrl}
          className="h-full"
        />

        {/* Caption overlay at bottom */}
        <CaptionOverlay
          language={captionLang}
          className="absolute bottom-16 left-0 right-0"
        />

        {/* Fullscreen button - top right */}
        <div className="absolute right-4 top-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            <Maximize className="h-5 w-5" />
          </Button>
        </div>

        {/* Language toggle - bottom right */}
        <div className="absolute bottom-4 right-4 z-10">
          <LanguageToggle value={captionLang} onChange={setCaptionLang} />
        </div>
      </main>
    </div>
  )
}
