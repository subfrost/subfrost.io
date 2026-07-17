"use client"

import { Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"

const STORAGE_KEY = "subfrost:editorial-theme"

type EditorialTheme = "light" | "dark"

function systemTheme(): EditorialTheme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function storedTheme(): EditorialTheme | null {
  if (typeof window === "undefined") return null
  const value = window.localStorage.getItem(STORAGE_KEY)
  return value === "dark" || value === "light" ? value : null
}

function applyTheme(theme: EditorialTheme) {
  document.documentElement.dataset.edPageTheme = theme
  document.documentElement.style.colorScheme = theme
  document.body.dataset.edPageTheme = theme
  const root = document.getElementById("ed-root")
  if (root) root.dataset.edTheme = theme
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<EditorialTheme>("light")

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const sync = () => {
      const nextTheme = storedTheme() ?? systemTheme()
      setTheme(nextTheme)
      applyTheme(nextTheme)
    }

    sync()
    query.addEventListener("change", sync)
    window.addEventListener("ed-theme-change", sync)
    return () => {
      query.removeEventListener("change", sync)
      window.removeEventListener("ed-theme-change", sync)
    }
  }, [])

  function toggleTheme() {
    const nextTheme: EditorialTheme = theme === "dark" ? "light" : "dark"
    window.localStorage.setItem(STORAGE_KEY, nextTheme)
    setTheme(nextTheme)
    applyTheme(nextTheme)
    window.dispatchEvent(new Event("ed-theme-change"))
  }

  const Icon = theme === "dark" ? Sun : Moon
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode"

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
      style={{
        background: "color-mix(in srgb, var(--ed-ink) 7%, transparent)",
        color: "var(--ed-ink)",
      }}
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
    </button>
  )
}
