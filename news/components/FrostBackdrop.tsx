"use client"

import React, { useEffect, useState } from "react"

// Lightweight self-contained frost backdrop adapted from the main subfrost.io
// site (components/FrostBackdrop.tsx). Renders a field of slowly-falling
// snowflakes behind page content. Pure CSS animation via the `fall` keyframe
// defined in app/globals.css — no external hooks.

const Flake = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"
      stroke="#eff6ff"
      strokeWidth="1"
      strokeLinecap="round"
    />
  </svg>
)

interface FrostBackdropProps {
  count?: number
  className?: string
}

export default function FrostBackdrop({ count = 80, className = "" }: FrostBackdropProps) {
  const [flakes, setFlakes] = useState<React.ReactNode[]>([])

  useEffect(() => {
    const next: React.ReactNode[] = []
    for (let i = 0; i < count; i++) {
      const size = 6 + Math.random() * 12
      const duration = 30 + Math.random() * 90
      const style: React.CSSProperties = {
        position: "absolute",
        left: `${Math.random() * 100}%`,
        top: "-5vh",
        opacity: 0.15 + Math.random() * 0.5,
        animation: `fall ${duration}s linear infinite`,
        animationDelay: `${-Math.random() * duration}s`,
        transform: `rotate(${Math.random() * 360}deg)`,
      }
      next.push(
        <div key={i} style={style}>
          <Flake size={size} />
        </div>,
      )
    }
    setFlakes(next)
  }, [count])

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      {flakes}
    </div>
  )
}
