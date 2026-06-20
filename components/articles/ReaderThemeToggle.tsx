"use client"

import { useState } from "react"
import { Sun } from "lucide-react"

// Light/dark reading toggle — the same Sun button used on app.subfrost.io (where
// it is currently hidden). Flips `data-ed-theme` on the editorial root instantly
// (no reload) and persists a long-lived cookie so server-rendered pages pick the
// same theme on the next navigation, avoiding a flash.
export function ReaderThemeToggle({ initial }: { initial: "light" | "dark" }) {
  const [theme, setTheme] = useState<"light" | "dark">(initial)

  function toggle() {
    const next = theme === "light" ? "dark" : "light"
    setTheme(next)
    document.cookie = `ed-theme=${next}; path=/; max-age=31536000; samesite=lax`
    const root = document.getElementById("ed-root")
    if (root) root.dataset.edTheme = next
  }

  const isLight = theme === "light"
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${isLight ? "dark" : "light"} mode`}
      className="transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
      style={{ color: isLight ? "var(--ed-accent)" : "var(--ed-muted)" }}
    >
      <Sun size={16} strokeWidth={2.5} />
    </button>
  )
}
