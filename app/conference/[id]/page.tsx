"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useRoom } from "@/hooks/use-room"
import { useBroadcast } from "@/hooks/use-broadcast"
import { useFocus } from "@/hooks/use-focus"
import { DualStreamView } from "@/components/stream/DualStreamView"
import { CaptionOverlay } from "@/components/stream/CaptionOverlay"
import { LiveChat } from "@/components/stream/LiveChat"
import { AdminPanel } from "@/components/conference/AdminPanel"
import { ParticipantList } from "@/components/conference/ParticipantList"
import { Button } from "@/components/ui/button"
import {
  Radio,
  Users,
  MessageSquare,
  X,
  Copy,
  Check,
  Monitor,
  MonitorOff,
  Camera,
  CameraOff,
  Maximize,
  Play,
  Square,
  Key,
} from "lucide-react"
import type { CaptionLanguage } from "@/lib/stream-types"

type SidePanel = "chat" | "participants" | null

export default function ConferenceRoomPage() {
  const params = useParams()
  const router = useRouter()
  const roomId = params.id as string

  const {
    room,
    self,
    isConnected,
    error,
    isAdmin,
    isPresenter,
    setPermissions,
    kickParticipant,
    startStream,
  } = useRoom({ roomId })

  // Broadcast hook for presenters
  const broadcast = useBroadcast({
    streamKey: room?.streamKey || null,
  })

  const focus = useFocus()
  const [captionLang] = useState<CaptionLanguage>("original")
  const [sidePanel, setSidePanel] = useState<SidePanel>("participants")
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [roomPassword, setRoomPassword] = useState<string | null>(null)
  const [roomToken, setRoomToken] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Load room token from sessionStorage for chat
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`subfrost-room-${roomId}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        setRoomToken(parsed.token || null)
      }
    } catch { /* ignore */ }
  }, [roomId])

  // If admin just created the room, show password from session storage
  useEffect(() => {
    if (isAdmin && room) {
      // Admin just arrived — fetch password info from create response
      // The password was shown during creation; we also offer a "show password" button
    }
  }, [isAdmin, room])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      el.requestFullscreen()
    }
  }, [])

  const copyRoomInfo = useCallback(() => {
    if (!room) return
    const text = `Room: ${room.id}\nPassword: (ask admin)`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [room])

  const handleStartStream = useCallback(async () => {
    const result = await startStream()
    if (result) {
      // Stream session created, room will update via polling
    }
  }, [startStream])

  // Construct HLS URLs from session
  const screenHlsUrl = room?.streamSessionId
    ? `/stream/live/${room.streamSessionId}/screen/playlist.m3u8`
    : null
  const cameraHlsUrl = room?.streamSessionId
    ? `/stream/live/${room.streamSessionId}/camera/playlist.m3u8`
    : null

  // Not connected yet: show loading or error
  if (!isConnected || !room || !self) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center"
        style={{ background: "#0a0f1a" }}
      >
        {error ? (
          <div className="text-center">
            <span
              className="block mb-4"
              style={{
                fontSize: 11,
                fontFamily: '"Courier New", monospace',
                color: "rgba(239,68,68,0.8)",
                letterSpacing: 2,
              }}
            >
              {error}
            </span>
            <button
              onClick={() => router.push("/conference")}
              style={{
                fontSize: 11,
                fontFamily: '"Courier New", monospace',
                color: "rgba(91,156,255,0.7)",
                letterSpacing: 2,
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              BACK TO LOBBY
            </button>
          </div>
        ) : (
          <span
            style={{
              fontSize: 11,
              fontFamily: '"Courier New", monospace',
              color: "rgba(91,156,255,0.4)",
              letterSpacing: 3,
            }}
          >
            CONNECTING...
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col bg-black">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 lg:px-6 py-2 flex-shrink-0">
        <div className="flex items-center gap-2 lg:gap-3 min-w-0">
          {/* Live indicator */}
          {broadcast.status === "live" && (
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-full w-full rounded-full bg-red-500" />
            </span>
          )}
          <h1
            className="text-sm font-semibold text-white truncate"
            style={{ fontFamily: '"Courier New", monospace' }}
          >
            {room.name}
          </h1>
          <span
            className="text-[10px] text-zinc-600 flex-shrink-0"
            style={{ fontFamily: '"Courier New", monospace', letterSpacing: 1 }}
          >
            ID: {room.id}
          </span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Copy room info */}
          <Button
            variant="ghost"
            size="icon"
            onClick={copyRoomInfo}
            className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10"
            title="Copy room info"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>

          {/* Show password (admin only) */}
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowPasswordModal(true)}
              className="h-8 w-8 text-amber-400/60 hover:text-amber-400 hover:bg-amber-400/10"
              title="Show room password"
            >
              <Key className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Participants toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (sidePanel === "participants") {
                setSidePanel(null)
                setMobilePanelOpen(false)
              } else {
                setSidePanel("participants")
                setMobilePanelOpen(true)
              }
            }}
            className={cn(
              "h-8 w-8 hover:bg-white/10",
              sidePanel === "participants" ? "text-white" : "text-white/50 hover:text-white"
            )}
          >
            <Users className="h-4 w-4" />
          </Button>

          {/* Chat toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (sidePanel === "chat") {
                setSidePanel(null)
                setMobilePanelOpen(false)
              } else {
                setSidePanel("chat")
                setMobilePanelOpen(true)
              }
            }}
            className={cn(
              "h-8 w-8 hover:bg-white/10",
              sidePanel === "chat" ? "text-white" : "text-white/50 hover:text-white"
            )}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Video area + presenter controls */}
        <main className="relative flex-1 min-w-0 min-h-0 flex flex-col" ref={containerRef}>
          {/* Video */}
          <div className="flex-1 relative min-h-0">
            {room.streamSessionId ? (
              <>
                <DualStreamView
                  screenSrc={screenHlsUrl}
                  cameraSrc={cameraHlsUrl}
                  focusTarget={focus.target}
                  className="h-full"
                />
                <CaptionOverlay
                  language={captionLang}
                  className="absolute bottom-12 left-0 right-0"
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Radio className="h-8 w-8 mx-auto mb-3 text-zinc-700" />
                  <span
                    className="block mb-1"
                    style={{
                      fontSize: 12,
                      fontFamily: '"Courier New", monospace',
                      color: "rgba(255,255,255,0.3)",
                      letterSpacing: 2,
                    }}
                  >
                    WAITING FOR STREAM
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: '"Courier New", monospace',
                      color: "rgba(255,255,255,0.15)",
                      letterSpacing: 1,
                    }}
                  >
                    {isAdmin
                      ? "Start the stream when ready"
                      : "The admin will start the stream shortly"}
                  </span>
                </div>
              </div>
            )}

            {/* Fullscreen button */}
            <div className="absolute right-2 top-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10"
              >
                <Maximize className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Presenter controls bar (only for active presenter or admin) */}
          {(isPresenter || isAdmin) && (
            <div
              className="flex items-center gap-2 px-4 py-2 border-t border-zinc-800 flex-shrink-0"
              style={{ background: "rgba(0,0,0,0.6)" }}
            >
              {/* Admin: Start stream button */}
              {isAdmin && !room.streamSessionId && (
                <button
                  onClick={handleStartStream}
                  className="flex items-center gap-2 rounded px-3 py-1.5 text-xs transition-all"
                  style={{
                    background: "rgba(34,197,94,0.15)",
                    border: "1px solid rgba(34,197,94,0.3)",
                    color: "rgba(34,197,94,0.9)",
                    fontFamily: '"Courier New", monospace',
                    letterSpacing: 2,
                    cursor: "pointer",
                  }}
                >
                  <Play className="h-3.5 w-3.5" />
                  START STREAM
                </button>
              )}

              {/* Presenter: Screen share */}
              {isPresenter && room.streamSessionId && (
                <>
                  {broadcast.screenStream ? (
                    <button
                      onClick={broadcast.stopScreen}
                      className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-all"
                      style={{
                        background: "rgba(239,68,68,0.15)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        color: "rgba(239,68,68,0.9)",
                        fontFamily: '"Courier New", monospace',
                        letterSpacing: 1,
                        cursor: "pointer",
                      }}
                    >
                      <MonitorOff className="h-3.5 w-3.5" />
                      STOP SCREEN
                    </button>
                  ) : (
                    <button
                      onClick={broadcast.startScreen}
                      className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-all"
                      style={{
                        background: "rgba(91,156,255,0.12)",
                        border: "1px solid rgba(91,156,255,0.25)",
                        color: "rgba(91,156,255,0.8)",
                        fontFamily: '"Courier New", monospace',
                        letterSpacing: 1,
                        cursor: "pointer",
                      }}
                    >
                      <Monitor className="h-3.5 w-3.5" />
                      SHARE SCREEN
                    </button>
                  )}

                  {/* Camera */}
                  {broadcast.cameraStream ? (
                    <button
                      onClick={broadcast.stopCamera}
                      className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-all"
                      style={{
                        background: "rgba(239,68,68,0.15)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        color: "rgba(239,68,68,0.9)",
                        fontFamily: '"Courier New", monospace',
                        letterSpacing: 1,
                        cursor: "pointer",
                      }}
                    >
                      <CameraOff className="h-3.5 w-3.5" />
                      STOP CAMERA
                    </button>
                  ) : (
                    <button
                      onClick={broadcast.startCamera}
                      className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-all"
                      style={{
                        background: "rgba(91,156,255,0.12)",
                        border: "1px solid rgba(91,156,255,0.25)",
                        color: "rgba(91,156,255,0.8)",
                        fontFamily: '"Courier New", monospace',
                        letterSpacing: 1,
                        cursor: "pointer",
                      }}
                    >
                      <Camera className="h-3.5 w-3.5" />
                      CAMERA
                    </button>
                  )}

                  {/* Go Live / Stop */}
                  {broadcast.status === "live" ? (
                    <button
                      onClick={broadcast.stopBroadcast}
                      className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-all ml-auto"
                      style={{
                        background: "rgba(239,68,68,0.2)",
                        border: "1px solid rgba(239,68,68,0.4)",
                        color: "rgba(239,68,68,0.9)",
                        fontFamily: '"Courier New", monospace',
                        letterSpacing: 2,
                        cursor: "pointer",
                      }}
                    >
                      <Square className="h-3 w-3" />
                      STOP BROADCAST
                    </button>
                  ) : broadcast.status === "connecting" ? (
                    <span
                      className="text-xs ml-auto"
                      style={{
                        fontFamily: '"Courier New", monospace',
                        color: "rgba(91,156,255,0.6)",
                        letterSpacing: 2,
                      }}
                    >
                      CONNECTING...
                    </span>
                  ) : (
                    (broadcast.screenStream || broadcast.cameraStream) && (
                      <button
                        onClick={broadcast.goLive}
                        className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-all ml-auto"
                        style={{
                          background: "rgba(239,68,68,0.15)",
                          border: "1px solid rgba(239,68,68,0.3)",
                          color: "rgba(239,68,68,0.9)",
                          fontFamily: '"Courier New", monospace',
                          letterSpacing: 2,
                          cursor: "pointer",
                        }}
                      >
                        <Radio className="h-3.5 w-3.5" />
                        GO LIVE
                      </button>
                    )
                  )}
                </>
              )}

              {/* Broadcast error */}
              {broadcast.error && (
                <span
                  className="text-xs ml-2"
                  style={{
                    fontFamily: '"Courier New", monospace',
                    color: "rgba(239,68,68,0.7)",
                  }}
                >
                  {broadcast.error}
                </span>
              )}
            </div>
          )}
        </main>

        {/* Side panel: Desktop always, mobile toggle */}
        <aside
          className={cn(
            "flex-shrink-0 border-zinc-800 flex flex-col bg-black",
            "lg:w-80 lg:border-l lg:h-auto",
            mobilePanelOpen && sidePanel
              ? "h-[40dvh] border-t lg:border-t-0"
              : "hidden lg:flex"
          )}
        >
          {sidePanel === "chat" && <LiveChat roomId={roomId} token={roomToken} />}
          {sidePanel === "participants" && (
            isAdmin ? (
              <AdminPanel
                participants={room.participants}
                activePresenter={room.activePresenter}
                selfId={self.id}
                onSetPermissions={(pid, mic, screen) => setPermissions(pid, mic, screen)}
                onKick={(pid) => kickParticipant(pid)}
                className="h-full"
              />
            ) : (
              <ParticipantList
                participants={room.participants}
                activePresenter={room.activePresenter}
                className="h-full"
              />
            )
          )}
          {!sidePanel && (
            isAdmin ? (
              <AdminPanel
                participants={room.participants}
                activePresenter={room.activePresenter}
                selfId={self.id}
                onSetPermissions={(pid, mic, screen) => setPermissions(pid, mic, screen)}
                onKick={(pid) => kickParticipant(pid)}
                className="h-full"
              />
            ) : (
              <ParticipantList
                participants={room.participants}
                activePresenter={room.activePresenter}
                className="h-full"
              />
            )
          )}
        </aside>
      </div>

      {/* Password modal (admin only) */}
      {showPasswordModal && isAdmin && (
        <PasswordModal
          roomId={room.id}
          onClose={() => setShowPasswordModal(false)}
        />
      )}
    </div>
  )
}

/**
 * Modal for admin to view/share room password.
 * Fetches it fresh since the password is only stored server-side.
 */
function PasswordModal({
  roomId,
  onClose,
}: {
  roomId: string
  onClose: () => void
}) {
  const [password, setPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // We need a dedicated endpoint to get the password. For now, we'll
  // store it in sessionStorage during room creation.
  useEffect(() => {
    const stored = sessionStorage.getItem(`subfrost-room-password-${roomId}`)
    setPassword(stored)
  }, [roomId])

  const copyAll = useCallback(() => {
    const text = `Room ID: ${roomId}\nPassword: ${password || "(unknown)"}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [roomId, password])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-md p-6 mx-4"
        style={{
          background: "#0a0f1a",
          border: "1px solid rgba(91,156,255,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <span
            style={{
              fontSize: 11,
              fontFamily: '"Courier New", monospace',
              color: "#5b9cff",
              letterSpacing: 3,
            }}
          >
            ROOM CREDENTIALS
          </span>
          <button
            onClick={onClose}
            className="text-zinc-600 hover:text-zinc-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <span
              style={{
                fontSize: 9,
                fontFamily: '"Courier New", monospace',
                color: "rgba(91,156,255,0.4)",
                letterSpacing: 2,
              }}
            >
              ROOM ID
            </span>
            <div
              className="mt-1 rounded px-3 py-2 text-sm"
              style={{
                background: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(91,156,255,0.15)",
                color: "rgba(91,156,255,0.9)",
                fontFamily: '"Courier New", monospace',
                letterSpacing: 2,
              }}
            >
              {roomId}
            </div>
          </div>
          <div>
            <span
              style={{
                fontSize: 9,
                fontFamily: '"Courier New", monospace',
                color: "rgba(91,156,255,0.4)",
                letterSpacing: 2,
              }}
            >
              PASSWORD
            </span>
            <div
              className="mt-1 rounded px-3 py-2 text-lg font-bold tracking-[0.3em]"
              style={{
                background: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(91,156,255,0.15)",
                color: "rgba(91,156,255,0.9)",
                fontFamily: '"Courier New", monospace',
              }}
            >
              {password || "—"}
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={copyAll}
            className="flex flex-1 items-center justify-center gap-2 rounded py-2 text-xs transition-all"
            style={{
              background: "rgba(91,156,255,0.12)",
              border: "1px solid rgba(91,156,255,0.25)",
              color: "rgba(91,156,255,0.8)",
              fontFamily: '"Courier New", monospace',
              letterSpacing: 2,
              cursor: "pointer",
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "COPIED" : "COPY"}
          </button>
          <button
            onClick={onClose}
            className="flex flex-1 items-center justify-center rounded py-2 text-xs transition-all"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.4)",
              fontFamily: '"Courier New", monospace',
              letterSpacing: 2,
              cursor: "pointer",
            }}
          >
            CLOSE
          </button>
        </div>

        <p
          className="mt-3 text-center"
          style={{
            fontSize: 9,
            fontFamily: '"Courier New", monospace',
            color: "rgba(255,255,255,0.2)",
            letterSpacing: 1,
          }}
        >
          Share these credentials with participants
        </p>
      </div>
    </div>
  )
}
