"use client"

import { useEffect, useMemo, useRef } from "react"

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

export default function ScrollRevealStatement({
  text,
  breakAfterLg,
}: {
  text: string
  /** Word indices after which to force a line break at the `lg` breakpoint (and up). */
  breakAfterLg?: number[]
}) {
  const rootRef = useRef<HTMLParagraphElement | null>(null)
  const words = useMemo(() => text.trim().split(/\s+/), [text])
  const lgBreaks = useMemo(() => new Set(breakAfterLg ?? []), [breakAfterLg])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const target = root

    const spans = Array.from(target.querySelectorAll<HTMLElement>("[data-scroll-word]"))
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    let frame = 0

    function paint() {
      frame = 0
      if (reducedMotion.matches) {
        spans.forEach((span) => span.style.setProperty("--word-opacity", "1"))
        return
      }

      const rect = target.getBoundingClientRect()
      const viewport = window.innerHeight || 1
      const start = viewport * 0.38
      const end = viewport * 0.08
      const progress = clamp((start - rect.top) / Math.max(1, start - end))
      const windowSize = 0.32

      spans.forEach((span, index) => {
        const wordStart = spans.length <= 1 ? 0 : index / (spans.length - 1)
        const opacity = clamp((progress + windowSize - wordStart) / windowSize)
        span.style.setProperty("--word-opacity", opacity.toFixed(3))
      })
    }

    const requestPaint = () => {
      if (frame) return
      frame = window.requestAnimationFrame(paint)
    }

    paint()
    const interval = window.setInterval(paint, 80)
    window.addEventListener("scroll", requestPaint, { passive: true })
    window.addEventListener("resize", requestPaint)
    reducedMotion.addEventListener("change", requestPaint)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.clearInterval(interval)
      window.removeEventListener("scroll", requestPaint)
      window.removeEventListener("resize", requestPaint)
      reducedMotion.removeEventListener("change", requestPaint)
    }
  }, [words.length])

  return (
    <p
      ref={rootRef}
      className="scroll-reveal-statement max-w-[920px] text-balance font-display text-[25px] font-normal leading-[1.22] sm:text-[42px] lg:text-[54px] lg:[text-wrap:normal]"
      aria-label={text}
    >
      {words.map((word, index) => (
        <span key={`${word}-${index}`} className="contents">
          <span data-scroll-word className="scroll-reveal-word" aria-hidden="true">
            <span className="scroll-reveal-word-shadow">{word}</span>
            <span className="scroll-reveal-word-active">{word}</span>
          </span>
          {lgBreaks.has(index) ? <br className="hidden lg:block" aria-hidden="true" /> : null}
        </span>
      ))}
    </p>
  )
}
