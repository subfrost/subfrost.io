"use client"

import { useState, useCallback, useRef } from "react"
import { cn } from "@/lib/utils"
import useSWR from "swr"
import { DualStreamView } from "@/components/stream/DualStreamView"
import { CaptionOverlay } from "@/components/stream/CaptionOverlay"
import { LanguageToggle } from "@/components/stream/LanguageToggle"
import { StreamOffline } from "@/components/stream/StreamOffline"
import { LiveChat } from "@/components/stream/LiveChat"
import { Button } from "@/components/ui/button"
import { Maximize, MessageSquare, X } from "lucide-react"
import { useFocus } from "@/hooks/use-focus"
import type { CaptionLanguage, StreamStatusResponse } from "@/lib/stream-types"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function LivePage() {
  const [captionLang, setCaptionLang] = useState<CaptionLanguage>("original")
  const [chatOpen, setChatOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const { data, isLoading } = useSWR<StreamStatusResponse>(
    "/api/stream/status",
    fetcher,
    { refreshInterval: 10_000 }
  )

  const focus = useFocus()

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

  // Construct same-origin HLS URLs from session ID (proxied to GCS via rewrite)
  const screenHlsUrl = session ? `/stream/live/${session.id}/screen/playlist.m3u8` : null
  const cameraHlsUrl = session ? `/stream/live/${session.id}/camera/playlist.m3u8` : null

  // Loading or offline state
  if (isLoading || !isLive || !session) {
    return <StreamOffline />
  }

  // Live state
  return (
    <div className="flex h-dvh flex-col bg-black">
      {/* Title bar */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 lg:px-6 py-2 lg:py-3 flex-shrink-0">
        <div className="flex items-center gap-2 lg:gap-3 min-w-0">
          {/* Live indicator dot */}
          <span className="relative flex h-2.5 w-2.5 lg:h-3 lg:w-3 flex-shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-full w-full rounded-full bg-red-500" />
          </span>
          <h1 className="text-sm lg:text-lg font-semibold text-white truncate">
            {session.title || "Live Stream"}
          </h1>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Chat toggle — mobile only */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setChatOpen((prev) => !prev)}
            className="h-8 w-8 lg:hidden text-white/70 hover:text-white hover:bg-white/10"
          >
            {chatOpen ? <X className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* Content: vertical on mobile, horizontal on desktop */}
      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Video area */}
        <main className="relative flex-1 min-w-0 min-h-0" ref={containerRef}>
          {/* Dual stream view with focus */}
          <DualStreamView
            screenSrc={screenHlsUrl}
            cameraSrc={cameraHlsUrl}
            focusTarget={focus.target}
            className="h-full"
          />

          {/* Caption overlay at bottom */}
          <CaptionOverlay
            language={captionLang}
            className="absolute bottom-12 lg:bottom-16 left-0 right-0"
          />

          {/* Fullscreen button - top right */}
          <div className="absolute right-2 top-2 lg:right-4 lg:top-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10"
            >
              <Maximize className="h-4 w-4 lg:h-5 lg:w-5" />
            </Button>
          </div>

          {/* Language toggle - bottom right */}
          <div className="absolute bottom-2 right-2 lg:bottom-4 lg:right-4 z-10">
            <LanguageToggle value={captionLang} onChange={setCaptionLang} />
          </div>
        </main>

        {/* Chat panel */}
        {/* Desktop: always-visible right sidebar */}
        {/* Mobile: togglable bottom panel at 40vh */}
        <aside
          className={cn(
            "flex-shrink-0 border-zinc-800 flex flex-col",
            // Desktop: always visible as sidebar
            "lg:w-80 lg:border-l lg:border-t-0 lg:h-auto lg:flex",
            // Mobile: bottom panel when open, hidden when closed
            chatOpen
              ? "h-[40dvh] border-t"
              : "hidden lg:flex"
          )}
        >
          <LiveChat />
        </aside>
      </div>
    </div>
  )
}
