"use client"

// components/stream/LiveChat.tsx
// Live chat panel for the viewer page.
//
// Design Decisions:
// - Dark style consistent with live viewer theme (black/zinc).
// - Nickname persisted in localStorage.
// - Auto-scrolls to bottom on new messages.
// - Connection indicator dot in header.
//
// Journal:
// - 2026-02-28 (Claude): Created live chat component.

import { useState, useEffect, useRef, useCallback, type FormEvent } from "react"
import { useChat } from "@/hooks/use-chat"
import { cn } from "@/lib/utils"

const NICKNAME_KEY = "subfrost-chat-nickname"

export function LiveChat({ className }: { className?: string }) {
  const { messages, isConnected, sendMessage } = useChat()
  const [nickname, setNickname] = useState("")
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const isAtBottomRef = useRef(true)

  // Load nickname from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(NICKNAME_KEY)
    if (saved) setNickname(saved)
  }, [])

  // Save nickname to localStorage
  const updateNickname = useCallback((value: string) => {
    setNickname(value)
    localStorage.setItem(NICKNAME_KEY, value)
  }, [])

  // Auto-scroll when new messages arrive (only if already at bottom)
  useEffect(() => {
    if (isAtBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    const nick = nickname.trim() || "anon"
    if (!trimmed || sending) return

    setSending(true)
    const ok = await sendMessage(nick, trimmed)
    if (ok) setInput("")
    setSending(false)
  }, [input, nickname, sending, sendMessage])

  return (
    <div className={cn("flex h-full flex-col bg-black", className)}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-zinc-800"
      >
        <div className="flex items-center gap-2">
          <span
            style={{
              fontSize: 10,
              fontFamily: '"Courier New", monospace',
              color: "rgba(255,255,255,0.6)",
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            LIVE CHAT
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              isConnected ? "bg-green-500" : "bg-zinc-600"
            )}
          />
          <span
            style={{
              fontSize: 9,
              fontFamily: '"Courier New", monospace',
              color: isConnected ? "rgba(34,197,94,0.7)" : "rgba(255,255,255,0.3)",
              letterSpacing: 1,
            }}
          >
            {isConnected ? "LIVE" : "..."}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-1"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}
      >
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-zinc-600">No messages yet</span>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="text-sm leading-relaxed">
            <span
              className="font-medium"
              style={{ color: nicknameColor(msg.nickname) }}
            >
              {msg.nickname}
            </span>
            <span className="text-zinc-500 mx-1">:</span>
            <span className="text-zinc-300">{msg.message}</span>
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="border-t border-zinc-800 px-4 py-3 space-y-2">
        {/* Nickname input */}
        <input
          type="text"
          value={nickname}
          onChange={(e) => updateNickname(e.target.value)}
          placeholder="Nickname"
          maxLength={20}
          className={cn(
            "w-full rounded px-2 py-1 text-xs",
            "bg-zinc-900 border border-zinc-800 text-zinc-300",
            "placeholder:text-zinc-600",
            "focus:outline-none focus:border-zinc-700"
          )}
          style={{ fontFamily: '"Courier New", monospace' }}
        />

        {/* Message input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Send a message..."
            maxLength={500}
            disabled={!isConnected}
            className={cn(
              "flex-1 rounded px-2 py-1 text-xs",
              "bg-zinc-900 border border-zinc-800 text-zinc-300",
              "placeholder:text-zinc-600",
              "focus:outline-none focus:border-zinc-700",
              "disabled:opacity-50"
            )}
            style={{ fontFamily: '"Courier New", monospace' }}
          />
          <button
            type="submit"
            disabled={!isConnected || sending || !input.trim()}
            className={cn(
              "rounded px-3 py-1 text-xs transition-all",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
            style={{
              fontFamily: '"Courier New", monospace',
              letterSpacing: 1,
              textTransform: "uppercase",
              background: "rgba(91,156,255,0.12)",
              border: "1px solid rgba(91,156,255,0.25)",
              color: "rgba(91,156,255,0.8)",
            }}
          >
            SEND
          </button>
        </form>
      </div>
    </div>
  )
}

// Deterministic color from nickname for visual distinction
function nicknameColor(name: string): string {
  const hues = [210, 280, 160, 30, 340, 190, 50, 120, 260, 0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = hues[Math.abs(hash) % hues.length]
  return `hsl(${hue}, 70%, 65%)`
}
