"use client"

import { useEffect, useRef, useState } from "react"

const TICKER_TEXT =
  "STANDBY \u2022 BROADCAST WILL BEGIN SHORTLY \u2022 \u5f85\u673a\u4e2d \u00b7 \u76f4\u64ad\u5373\u5c06\u5f00\u59cb \u2022 " +
  "STANDBY \u2022 BROADCAST WILL BEGIN SHORTLY \u2022 \u5f85\u673a\u4e2d \u00b7 \u76f4\u64ad\u5373\u5c06\u5f00\u59cb \u2022 "

export function StreamOffline() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number>(0)
  const [clock, setClock] = useState("")
  const [dateLine, setDateLine] = useState("")
  const tickerRef = useRef<HTMLDivElement>(null)

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
        now.toLocaleDateString("en-US", {
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "numeric",
        }).toUpperCase()
      )
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  // Canvas snowflake animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const W = 120
    const H = 120
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const t0 = performance.now()

    const pts: { x: number; y: number; vx: number; vy: number; s: number; a: number }[] = []
    for (let i = 0; i < 12; i++) {
      pts.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        s: Math.random() * 1.0 + 0.3,
        a: Math.random() * 0.25 + 0.05,
      })
    }

    function draw(t: number) {
      ctx!.clearRect(0, 0, W, H)
      const cx = W / 2
      const cy = H / 2
      const pulse = 1 + Math.sin(t * 1.5) * 0.03
      const sz = 42 * pulse
      const rot = t * 0.08

      for (const p of pts) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x = W
        if (p.x > W) p.x = 0
        if (p.y < 0) p.y = H
        if (p.y > H) p.y = 0
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.s, 0, 6.283)
        ctx!.fillStyle = `rgba(91,156,255,${p.a})`
        ctx!.fill()
      }

      ctx!.save()
      ctx!.translate(cx, cy)
      ctx!.rotate(rot)

      for (let pass = 0; pass < 2; pass++) {
        if (pass === 0) {
          ctx!.globalAlpha = 0.25
          ctx!.lineWidth = 3.5
          ctx!.shadowBlur = 25
        } else {
          ctx!.globalAlpha = 1
          ctx!.lineWidth = 1.5
          ctx!.shadowBlur = 8
        }
        ctx!.shadowColor = "#5b9cff"
        ctx!.strokeStyle = "#5b9cff"
        ctx!.lineCap = "round"

        for (let i = 0; i < 6; i++) {
          ctx!.save()
          ctx!.rotate(i * 1.0472)
          ctx!.beginPath()
          ctx!.moveTo(0, 0)
          ctx!.lineTo(sz, 0)
          ctx!.stroke()
          const bp = [0.35, 0.6, 0.82]
          const bl = [0.38, 0.28, 0.16]
          const ba = 0.6981
          for (let j = 0; j < 3; j++) {
            const px = bp[j] * sz
            const ln = bl[j] * sz
            ctx!.beginPath()
            ctx!.moveTo(px, 0)
            ctx!.lineTo(px + ln * Math.cos(ba), -ln * Math.sin(ba))
            ctx!.stroke()
            ctx!.beginPath()
            ctx!.moveTo(px, 0)
            ctx!.lineTo(px + ln * Math.cos(-ba), -ln * Math.sin(-ba))
            ctx!.stroke()
          }
          if (pass === 1) {
            const d = 3
            ctx!.fillStyle = "rgba(199,224,254,0.35)"
            ctx!.beginPath()
            ctx!.moveTo(sz - d, 0)
            ctx!.lineTo(sz, -d)
            ctx!.lineTo(sz + d, 0)
            ctx!.lineTo(sz, d)
            ctx!.closePath()
            ctx!.fill()
            ctx!.stroke()
          }
          ctx!.restore()
        }
      }

      ctx!.globalAlpha = 0.35
      ctx!.lineWidth = 1
      ctx!.shadowBlur = 4
      const hs = sz * 0.18
      ctx!.beginPath()
      for (let i = 0; i < 6; i++) {
        const hx = hs * Math.cos(i * 1.0472)
        const hy = hs * Math.sin(i * 1.0472)
        if (i === 0) ctx!.moveTo(hx, hy)
        else ctx!.lineTo(hx, hy)
      }
      ctx!.closePath()
      ctx!.stroke()

      ctx!.globalAlpha = 1
      ctx!.shadowBlur = 12
      ctx!.shadowColor = "#c7e0fe"
      ctx!.beginPath()
      ctx!.arc(0, 0, 2.5, 0, 6.283)
      ctx!.fillStyle = "#c7e0fe"
      ctx!.fill()
      ctx!.restore()
    }

    function tick() {
      const elapsed = (performance.now() - t0) / 1000
      draw(elapsed)
      frameRef.current = requestAnimationFrame(tick)
    }
    tick()

    return () => cancelAnimationFrame(frameRef.current)
  }, [])

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden select-none"
      style={{ background: "#0a0f1a" }}
    >
      {/* Scan lines overlay */}
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

      {/* Top bar — network bug */}
      <header className="relative z-20 flex items-center justify-between px-6 py-3"
        style={{ borderBottom: "1px solid rgba(91,156,255,0.15)" }}
      >
        <div className="flex items-center gap-3">
          {/* SUBFROST wordmark */}
          <svg
            width="140"
            height="20"
            viewBox="0 0 160 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g
              stroke="#5b9cff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            >
              <path d="M12 4 L3 4 L3 11 L12 11 L12 20 L3 20" />
              <path d="M19 4 L19 18 Q19 20 21 20 L28 20 Q30 20 30 18 L30 4" />
              <path d="M37 4 L37 20 L44 20 Q48 20 48 16 Q48 12.5 44 12 L37 12 M37 4 L44 4 Q48 4 48 8 Q48 12 44 12" />
              <path d="M55 4 L66 4 M55 4 L55 20 M55 12 L64 12" />
              <path d="M73 4 L73 20 M73 4 L80 4 Q84 4 84 8 Q84 12 80 12 L73 12 M80 12 L84 20" />
              <path d="M93 6 Q91 4 93 4 L100 4 Q102 4 102 6 L102 18 Q102 20 100 20 L93 20 Q91 20 91 18 Z" />
              <path d="M118 4 L109 4 L109 11 L118 11 L118 20 L109 20" />
              <path d="M125 4 L138 4 M131.5 4 L131.5 20" />
            </g>
          </svg>
          <span
            style={{
              fontSize: 9,
              fontFamily: '"Courier New", monospace',
              color: "rgba(91,156,255,0.35)",
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            LIVE
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

      {/* Center content */}
      <main className="relative z-20 flex flex-1 flex-col items-center justify-center">
        {/* Snowflake */}
        <canvas
          ref={canvasRef}
          width={120}
          height={120}
          style={{ width: 120, height: 120 }}
        />

        {/* STANDBY badge */}
        <div
          className="mt-8 flex items-center gap-3"
        >
          {/* Pulsing dot */}
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{
                backgroundColor: "rgba(91,156,255,0.6)",
                animation: "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite",
              }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ backgroundColor: "rgba(91,156,255,0.8)" }}
            />
          </span>
          <span
            style={{
              fontSize: 13,
              fontFamily: '"Courier New", monospace',
              color: "rgba(91,156,255,0.5)",
              letterSpacing: 6,
              textTransform: "uppercase",
            }}
          >
            STANDBY
          </span>
        </div>

        <span
          className="mt-3"
          style={{
            fontSize: 11,
            fontFamily: '"Courier New", monospace',
            color: "rgba(91,156,255,0.25)",
            letterSpacing: 2,
          }}
        >
          &#x5F85;&#x673A;&#x4E2D;
        </span>
      </main>

      {/* Bottom ticker crawl */}
      <footer
        className="relative z-20"
        style={{ borderTop: "1px solid rgba(91,156,255,0.15)" }}
      >
        {/* Ticker label */}
        <div className="flex items-stretch">
          <div
            className="flex items-center px-4 py-2"
            style={{
              background: "rgba(91,156,255,0.12)",
              borderRight: "1px solid rgba(91,156,255,0.15)",
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontFamily: '"Courier New", monospace',
                color: "rgba(91,156,255,0.6)",
                letterSpacing: 3,
                fontWeight: "bold",
              }}
            >
              SUBFROST
            </span>
          </div>

          {/* Scrolling ticker */}
          <div className="flex-1 overflow-hidden py-2" ref={tickerRef}>
            <div
              className="whitespace-nowrap"
              style={{
                animation: "ticker-scroll 20s linear infinite",
                fontSize: 11,
                fontFamily: '"Courier New", monospace',
                color: "rgba(91,156,255,0.4)",
                letterSpacing: 2,
              }}
            >
              {TICKER_TEXT}
              {TICKER_TEXT}
            </div>
          </div>
        </div>
      </footer>

      {/* Corner frame marks */}
      <svg className="pointer-events-none absolute left-4 top-12 z-20" width="20" height="20" fill="none">
        <path d="M0 20 L0 0 L20 0" stroke="rgba(91,156,255,0.15)" strokeWidth="1" />
      </svg>
      <svg className="pointer-events-none absolute right-4 top-12 z-20" width="20" height="20" fill="none">
        <path d="M20 20 L20 0 L0 0" stroke="rgba(91,156,255,0.15)" strokeWidth="1" />
      </svg>
      <svg className="pointer-events-none absolute bottom-12 left-4 z-20" width="20" height="20" fill="none">
        <path d="M0 0 L0 20 L20 20" stroke="rgba(91,156,255,0.15)" strokeWidth="1" />
      </svg>
      <svg className="pointer-events-none absolute bottom-12 right-4 z-20" width="20" height="20" fill="none">
        <path d="M20 0 L20 20 L0 20" stroke="rgba(91,156,255,0.15)" strokeWidth="1" />
      </svg>

      {/* Ticker scroll keyframe */}
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes ping {
          75%, 100% {
            transform: scale(2.5);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
