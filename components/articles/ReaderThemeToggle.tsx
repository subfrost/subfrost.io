"use client"

import { useState } from "react"

// Light/dark reading toggle. Flips the `data-ed-theme` on the editorial root
// instantly (no reload) and persists a long-lived cookie so server-rendered
// pages pick the same theme on the next navigation — avoiding a flash.
export function ReaderThemeToggle({ initial }: { initial: "light" | "dark" }) {
  const [theme, setTheme] = useState<"light" | "dark">(initial)

  function set(next: "light" | "dark") {
    setTheme(next)
    document.cookie = `ed-theme=${next}; path=/; max-age=31536000; samesite=lax`
    const root = document.getElementById("ed-root")
    if (root) root.dataset.edTheme = next
  }

  return (
    <div
      className="inline-flex overflow-hidden rounded-full border border-white/25 text-[13px]"
      role="group"
      aria-label="Reading theme"
    >
      {(["light", "dark"] as const).map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          onClick={() => set(t)}
          className={`px-3.5 py-1.5 capitalize transition-colors ${
            theme === t ? "bg-white text-[#0a1628]" : "text-[#cdd8ec] hover:text-white"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}
