"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { BroadcastControls } from "@/components/stream/BroadcastControls"
import { Radio } from "lucide-react"

function BroadcastPageContent() {
  const searchParams = useSearchParams()
  const [streamKey, setStreamKey] = useState("")
  const [isKeySet, setIsKeySet] = useState(false)
  const [clock, setClock] = useState("")
  const [dateLine, setDateLine] = useState("")

  // Pre-fill from URL search params
  useEffect(() => {
    const keyParam = searchParams.get("key")
    if (keyParam) {
      setStreamKey(keyParam)
    }
  }, [searchParams])

  // Live clock
  useEffect(() => {
    function update() {
      const now = new Date()
      setClock(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      )
      setDateLine(
        now
          .toLocaleDateString("en-US", {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          })
          .toUpperCase()
      )
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  function handleStart() {
    if (streamKey.trim()) {
      setIsKeySet(true)
    }
  }

  if (!isKeySet) {
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
              <Radio className="h-4 w-4" style={{ color: "#5b9cff" }} />
              <span
                style={{
                  fontSize: 13,
                  fontFamily: '"Courier New", monospace',
                  color: "#5b9cff",
                  letterSpacing: 6,
                  textTransform: "uppercase",
                }}
              >
                BROADCAST
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
              Enter your stream key to begin
            </span>
          </div>

          {/* Key input card */}
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
                handleStart()
              }}
              className="space-y-4"
            >
              <div>
                <label
                  style={{
                    fontSize: 10,
                    fontFamily: '"Courier New", monospace',
                    color: "rgba(91,156,255,0.5)",
                    letterSpacing: 3,
                    textTransform: "uppercase",
                  }}
                >
                  STREAM KEY
                </label>
                <input
                  type="text"
                  placeholder="Enter key..."
                  value={streamKey}
                  onChange={(e) => setStreamKey(e.target.value)}
                  autoFocus
                  className="mt-2 w-full rounded px-3 py-2 text-sm outline-none"
                  style={{
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid rgba(91,156,255,0.2)",
                    color: "rgba(91,156,255,0.8)",
                    fontFamily: '"Courier New", monospace',
                    letterSpacing: 1,
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={!streamKey.trim()}
                className="flex w-full items-center justify-center gap-2 rounded py-2.5 text-sm font-medium transition-all"
                style={{
                  background: streamKey.trim()
                    ? "rgba(91,156,255,0.15)"
                    : "rgba(91,156,255,0.05)",
                  border: "1px solid rgba(91,156,255,0.25)",
                  color: streamKey.trim()
                    ? "rgba(91,156,255,0.9)"
                    : "rgba(91,156,255,0.3)",
                  fontFamily: '"Courier New", monospace',
                  letterSpacing: 3,
                  cursor: streamKey.trim() ? "pointer" : "not-allowed",
                }}
              >
                <Radio className="h-3.5 w-3.5" />
                START
              </button>
            </form>
          </div>
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

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden select-none"
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

      {/* Top bar */}
      <header
        className="relative z-20 flex items-center justify-between px-6 py-3"
        style={{ borderBottom: "1px solid rgba(91,156,255,0.15)" }}
      >
        <div className="flex items-center gap-3">
          <Radio className="h-4 w-4" style={{ color: "#5b9cff" }} />
          <span
            style={{
              fontSize: 13,
              fontFamily: '"Courier New", monospace',
              color: "#5b9cff",
              letterSpacing: 6,
              textTransform: "uppercase",
            }}
          >
            BROADCAST STUDIO
          </span>
        </div>

        {/* Clock */}
        <div className="flex items-center gap-4">
          <span
            style={{
              fontSize: 10,
              fontFamily: '"Courier New", monospace',
              color: "rgba(91,156,255,0.35)",
              letterSpacing: 2,
            }}
          >
            {dateLine}
          </span>
          <span
            style={{
              fontSize: 14,
              fontFamily: '"Courier New", monospace',
              color: "rgba(91,156,255,0.6)",
              letterSpacing: 3,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {clock}
          </span>
        </div>
      </header>

      {/* Controls and previews */}
      <main className="relative z-20 flex-1 p-6">
        <BroadcastControls streamKey={streamKey} />
      </main>

      {/* Corner frame marks */}
      <svg className="pointer-events-none absolute left-4 top-12 z-20" width="20" height="20" fill="none">
        <path d="M0 20 L0 0 L20 0" stroke="rgba(91,156,255,0.15)" strokeWidth="1" />
      </svg>
      <svg className="pointer-events-none absolute right-4 top-12 z-20" width="20" height="20" fill="none">
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

export default function BroadcastPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center"
          style={{ background: "#0a0f1a" }}
        >
          <span
            style={{
              fontSize: 11,
              fontFamily: '"Courier New", monospace',
              color: "rgba(91,156,255,0.4)",
              letterSpacing: 3,
            }}
          >
            LOADING...
          </span>
        </div>
      }
    >
      <BroadcastPageContent />
    </Suspense>
  )
}
