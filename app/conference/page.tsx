"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useRoom } from "@/hooks/use-room"
import { Radio, Users, Plus, LogIn } from "lucide-react"

type Mode = "lobby" | "create" | "join" | "created"

export default function ConferenceLobbyPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("lobby")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [createdRoom, setCreatedRoom] = useState<{ roomId: string; password: string } | null>(null)

  // Create form
  const [roomName, setRoomName] = useState("")
  const [createDisplayName, setCreateDisplayName] = useState("")
  const [createWallet, setCreateWallet] = useState("")

  // Join form
  const [joinRoomId, setJoinRoomId] = useState("")
  const [joinPassword, setJoinPassword] = useState("")
  const [joinDisplayName, setJoinDisplayName] = useState("")
  const [joinWallet, setJoinWallet] = useState("")

  const { createRoom, joinRoom } = useRoom({ roomId: null })

  async function handleCreate() {
    if (!createDisplayName.trim()) {
      setError("Display name is required")
      return
    }
    setLoading(true)
    setError(null)

    const result = await createRoom(
      roomName.trim() || "Conference Room",
      createDisplayName.trim(),
      createWallet.trim() || undefined
    )

    if (result) {
      // Store password so admin can view it in the room
      sessionStorage.setItem(
        `subfrost-room-password-${result.roomId}`,
        result.password
      )
      setCreatedRoom({ roomId: result.roomId, password: result.password })
      setMode("created")
    } else {
      setError("Failed to create room")
    }
    setLoading(false)
  }

  async function handleJoin() {
    if (!joinRoomId.trim() || !joinPassword.trim()) {
      setError("Room ID and password are required")
      return
    }
    if (!joinDisplayName.trim()) {
      setError("Display name is required")
      return
    }
    setLoading(true)
    setError(null)

    const result = await joinRoom(
      joinRoomId.trim(),
      joinPassword.trim(),
      joinDisplayName.trim(),
      joinWallet.trim() || undefined
    )

    if (result) {
      router.push(`/conference/${joinRoomId.trim()}`)
    } else {
      setError("Failed to join room. Check room ID and password.")
    }
    setLoading(false)
  }

  const inputStyle = {
    background: "rgba(0,0,0,0.4)",
    border: "1px solid rgba(91,156,255,0.2)",
    color: "rgba(91,156,255,0.8)",
    fontFamily: '"Courier New", monospace',
    letterSpacing: 1,
  }

  const labelStyle = {
    fontSize: 10,
    fontFamily: '"Courier New", monospace',
    color: "rgba(91,156,255,0.5)",
    letterSpacing: 3,
    textTransform: "uppercase" as const,
  }

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden select-none"
      style={{ background: "#0a0f1a" }}
    >
      {/* Scan lines */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)",
          mixBlendMode: "multiply",
        }}
      />
      {/* Vignette */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      <div className="relative z-20 w-full max-w-md px-4">
        {/* Title */}
        <div className="mb-8 text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <Users className="h-4 w-4" style={{ color: "#5b9cff" }} />
            <span
              style={{
                fontSize: 13,
                fontFamily: '"Courier New", monospace',
                color: "#5b9cff",
                letterSpacing: 6,
                textTransform: "uppercase",
              }}
            >
              CONFERENCE
            </span>
          </div>
          <span
            style={{
              fontSize: 11,
              fontFamily: '"Courier New", monospace',
              color: "rgba(91,156,255,0.35)",
              letterSpacing: 2,
            }}
          >
            {mode === "lobby"
              ? "Create or join a conference room"
              : mode === "create"
              ? "Set up a new conference room"
              : "Enter room credentials"}
          </span>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mb-4 rounded px-3 py-2 text-center text-xs"
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "rgba(239,68,68,0.8)",
              fontFamily: '"Courier New", monospace',
            }}
          >
            {error}
          </div>
        )}

        {/* Lobby: Create or Join buttons */}
        {mode === "lobby" && (
          <div className="space-y-3">
            <button
              onClick={() => setMode("create")}
              className="flex w-full items-center justify-center gap-3 rounded-md p-4 transition-all"
              style={{
                background: "rgba(91,156,255,0.06)",
                border: "1px solid rgba(91,156,255,0.2)",
                color: "rgba(91,156,255,0.8)",
                fontFamily: '"Courier New", monospace',
                letterSpacing: 3,
                cursor: "pointer",
              }}
            >
              <Plus className="h-4 w-4" />
              CREATE ROOM
            </button>
            <button
              onClick={() => setMode("join")}
              className="flex w-full items-center justify-center gap-3 rounded-md p-4 transition-all"
              style={{
                background: "rgba(91,156,255,0.06)",
                border: "1px solid rgba(91,156,255,0.2)",
                color: "rgba(91,156,255,0.8)",
                fontFamily: '"Courier New", monospace',
                letterSpacing: 3,
                cursor: "pointer",
              }}
            >
              <LogIn className="h-4 w-4" />
              JOIN ROOM
            </button>
          </div>
        )}

        {/* Create Room Form */}
        {mode === "create" && (
          <div
            className="rounded-md p-6"
            style={{
              background: "rgba(91,156,255,0.04)",
              border: "1px solid rgba(91,156,255,0.15)",
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleCreate()
              }}
              className="space-y-4"
            >
              <div>
                <label style={labelStyle}>YOUR NAME</label>
                <input
                  type="text"
                  placeholder="Enter your name..."
                  value={createDisplayName}
                  onChange={(e) => setCreateDisplayName(e.target.value)}
                  autoFocus
                  maxLength={30}
                  className="mt-2 w-full rounded px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>ROOM NAME (OPTIONAL)</label>
                <input
                  type="text"
                  placeholder="Conference Room"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  maxLength={50}
                  className="mt-2 w-full rounded px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>WALLET ADDRESS (OPTIONAL)</label>
                <input
                  type="text"
                  placeholder="bc1q..."
                  value={createWallet}
                  onChange={(e) => setCreateWallet(e.target.value)}
                  className="mt-2 w-full rounded px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("lobby")
                    setError(null)
                  }}
                  className="flex-1 rounded py-2.5 text-sm transition-all"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.4)",
                    fontFamily: '"Courier New", monospace',
                    letterSpacing: 2,
                    cursor: "pointer",
                  }}
                >
                  BACK
                </button>
                <button
                  type="submit"
                  disabled={loading || !createDisplayName.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded py-2.5 text-sm font-medium transition-all"
                  style={{
                    background: createDisplayName.trim()
                      ? "rgba(91,156,255,0.15)"
                      : "rgba(91,156,255,0.05)",
                    border: "1px solid rgba(91,156,255,0.25)",
                    color: createDisplayName.trim()
                      ? "rgba(91,156,255,0.9)"
                      : "rgba(91,156,255,0.3)",
                    fontFamily: '"Courier New", monospace',
                    letterSpacing: 3,
                    cursor: createDisplayName.trim() && !loading ? "pointer" : "not-allowed",
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {loading ? "CREATING..." : "CREATE"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Join Room Form */}
        {mode === "join" && (
          <div
            className="rounded-md p-6"
            style={{
              background: "rgba(91,156,255,0.04)",
              border: "1px solid rgba(91,156,255,0.15)",
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleJoin()
              }}
              className="space-y-4"
            >
              <div>
                <label style={labelStyle}>YOUR NAME</label>
                <input
                  type="text"
                  placeholder="Enter your name..."
                  value={joinDisplayName}
                  onChange={(e) => setJoinDisplayName(e.target.value)}
                  autoFocus
                  maxLength={30}
                  className="mt-2 w-full rounded px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>ROOM ID</label>
                <input
                  type="text"
                  placeholder="Enter room ID..."
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value)}
                  className="mt-2 w-full rounded px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>PASSWORD</label>
                <input
                  type="text"
                  placeholder="Enter room password..."
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  className="mt-2 w-full rounded px-3 py-2 text-sm outline-none uppercase"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>WALLET ADDRESS (OPTIONAL)</label>
                <input
                  type="text"
                  placeholder="bc1q..."
                  value={joinWallet}
                  onChange={(e) => setJoinWallet(e.target.value)}
                  className="mt-2 w-full rounded px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("lobby")
                    setError(null)
                  }}
                  className="flex-1 rounded py-2.5 text-sm transition-all"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.4)",
                    fontFamily: '"Courier New", monospace',
                    letterSpacing: 2,
                    cursor: "pointer",
                  }}
                >
                  BACK
                </button>
                <button
                  type="submit"
                  disabled={
                    loading ||
                    !joinRoomId.trim() ||
                    !joinPassword.trim() ||
                    !joinDisplayName.trim()
                  }
                  className="flex flex-1 items-center justify-center gap-2 rounded py-2.5 text-sm font-medium transition-all"
                  style={{
                    background:
                      joinRoomId.trim() && joinPassword.trim() && joinDisplayName.trim()
                        ? "rgba(91,156,255,0.15)"
                        : "rgba(91,156,255,0.05)",
                    border: "1px solid rgba(91,156,255,0.25)",
                    color:
                      joinRoomId.trim() && joinPassword.trim() && joinDisplayName.trim()
                        ? "rgba(91,156,255,0.9)"
                        : "rgba(91,156,255,0.3)",
                    fontFamily: '"Courier New", monospace',
                    letterSpacing: 3,
                    cursor:
                      joinRoomId.trim() && joinPassword.trim() && joinDisplayName.trim() && !loading
                        ? "pointer"
                        : "not-allowed",
                  }}
                >
                  <LogIn className="h-3.5 w-3.5" />
                  {loading ? "JOINING..." : "JOIN"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Room Created — show credentials */}
        {mode === "created" && createdRoom && (
          <div
            className="rounded-md p-6"
            style={{
              background: "rgba(91,156,255,0.04)",
              border: "1px solid rgba(91,156,255,0.15)",
            }}
          >
            <div className="text-center mb-4">
              <span
                style={{
                  fontSize: 11,
                  fontFamily: '"Courier New", monospace',
                  color: "rgba(34,197,94,0.8)",
                  letterSpacing: 2,
                }}
              >
                ROOM CREATED SUCCESSFULLY
              </span>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <span style={{ ...labelStyle }}>ROOM ID</span>
                <div
                  className="mt-1 rounded px-3 py-2 text-sm tracking-widest"
                  style={{
                    ...inputStyle,
                    cursor: "default",
                  }}
                >
                  {createdRoom.roomId}
                </div>
              </div>
              <div>
                <span style={{ ...labelStyle }}>PASSWORD (SHARE WITH PARTICIPANTS)</span>
                <div
                  className="mt-1 rounded px-3 py-2 text-lg font-bold tracking-[0.4em] text-center"
                  style={{
                    ...inputStyle,
                    color: "rgba(91,156,255,1)",
                    cursor: "default",
                  }}
                >
                  {createdRoom.password}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  const text = `Room ID: ${createdRoom.roomId}\nPassword: ${createdRoom.password}`
                  navigator.clipboard.writeText(text)
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded py-2.5 text-sm transition-all"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.5)",
                  fontFamily: '"Courier New", monospace',
                  letterSpacing: 2,
                  cursor: "pointer",
                }}
              >
                COPY
              </button>
              <button
                onClick={() => router.push(`/conference/${createdRoom.roomId}`)}
                className="flex flex-1 items-center justify-center gap-2 rounded py-2.5 text-sm font-medium transition-all"
                style={{
                  background: "rgba(91,156,255,0.15)",
                  border: "1px solid rgba(91,156,255,0.25)",
                  color: "rgba(91,156,255,0.9)",
                  fontFamily: '"Courier New", monospace',
                  letterSpacing: 3,
                  cursor: "pointer",
                }}
              >
                ENTER ROOM
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Corner frame marks */}
      <svg className="pointer-events-none absolute left-4 top-4 z-20" width="20" height="20" fill="none">
        <path d="M0 20 L0 0 L20 0" stroke="rgba(91,156,255,0.15)" strokeWidth="1" />
      </svg>
      <svg className="pointer-events-none absolute right-4 top-4 z-20" width="20" height="20" fill="none">
        <path d="M20 20 L20 0 L0 0" stroke="rgba(91,156,255,0.15)" strokeWidth="1" />
      </svg>
      <svg className="pointer-events-none absolute bottom-4 left-4 z-20" width="20" height="20" fill="none">
        <path d="M0 0 L0 20 L20 20" stroke="rgba(91,156,255,0.15)" strokeWidth="1" />
      </svg>
      <svg className="pointer-events-none absolute bottom-4 right-4 z-20" width="20" height="20" fill="none">
        <path d="M20 0 L20 20 L0 20" stroke="rgba(91,156,255,0.15)" strokeWidth="1" />
      </svg>
    </div>
  )
}
