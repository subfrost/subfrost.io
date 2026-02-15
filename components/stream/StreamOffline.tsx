"use client"

import { useEffect, useRef, useState } from "react"

const MESSAGES = [
  "No stream connected",
  "未连接直播",
]

const MARQUEE_CYCLE_MS = 4000

export function StreamOffline() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number>(0)
  const [messageIndex, setMessageIndex] = useState(0)
  const [fading, setFading] = useState(false)

  // Cycle messages
  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setMessageIndex((i) => (i + 1) % MESSAGES.length)
        setFading(false)
      }, 500)
    }, MARQUEE_CYCLE_MS)
    return () => clearInterval(interval)
  }, [])

  // Canvas snowflake animation (from subfrost-app SplashScreen)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const W = 160
    const H = 160
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const t0 = performance.now()

    // Particles
    const pts: { x: number; y: number; vx: number; vy: number; s: number; a: number }[] = []
    for (let i = 0; i < 15; i++) {
      pts.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        s: Math.random() * 1.2 + 0.4,
        a: Math.random() * 0.3 + 0.08,
      })
    }

    function draw(t: number) {
      ctx!.clearRect(0, 0, W, H)
      const cx = W / 2
      const cy = H / 2
      const pulse = 1 + Math.sin(t * 1.5) * 0.03
      const sz = 55 * pulse
      const rot = t * 0.08

      // Particles
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

      // Two-pass glow
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
            const d = 4
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

      // Inner hex
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

      // Center dot
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
      className="flex min-h-screen flex-col items-center justify-center"
      style={{ background: "#0a1628" }}
    >
      <canvas
        ref={canvasRef}
        width={160}
        height={160}
        style={{ width: 160, height: 160 }}
      />

      {/* SUBFROST wordmark */}
      <svg
        width="240"
        height="32"
        viewBox="0 0 160 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ marginTop: 22 }}
      >
        <defs>
          <filter id="sf-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g
          filter="url(#sf-glow)"
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

      {/* Cycling marquee message */}
      <div
        style={{
          marginTop: 32,
          height: 24,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontFamily: '"Courier New", Courier, monospace',
            color: "rgba(91,156,255,0.5)",
            letterSpacing: 2,
            transition: "opacity 0.5s ease",
            opacity: fading ? 0 : 1,
          }}
        >
          {MESSAGES[messageIndex]}
        </span>
      </div>
    </div>
  )
}
