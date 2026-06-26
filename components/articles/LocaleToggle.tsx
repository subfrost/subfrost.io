"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { rememberEditorialLocale } from "./localePreference"

const LOCALE_EXIT_MS = 160

// The same single-glyph 文 translation button used across subfrost.io and
// app.subfrost.io. Drives the reading language via the editorial `?lang=` SSR
// routing (en↔zh). Self-contained so it can live in the shared SiteHeader on
// every editorial surface; the article fetch falls back to the primary
// translation when the requested locale is missing (lib/cms/articles
// chooseTranslation), so a missing locale never 404s.
export function LocaleToggle() {
  const pathname = usePathname()
  const router = useRouter()
  const params = useSearchParams()
  const [isNavigating, setIsNavigating] = useState(false)
  const isZh = params.get("lang") === "zh"

  function toggle() {
    if (isNavigating) return

    const next = isZh ? "en" : "zh"
    const p = new URLSearchParams(params.toString())
    p.set("lang", next)
    rememberEditorialLocale(next)
    setIsNavigating(true)

    const root = document.getElementById("ed-root")
    root?.classList.add("ed-page-exiting")

    window.setTimeout(() => {
      router.push(`${pathname}?${p.toString()}${window.location.hash}`, { scroll: false })
      setIsNavigating(false)
    }, LOCALE_EXIT_MS)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      onMouseDown={(event) => event.preventDefault()}
      disabled={isNavigating}
      aria-busy={isNavigating}
      aria-label={`Switch to ${isZh ? "English" : "Chinese"}`}
      className="inline-flex h-9 w-9 shrink-0 select-none appearance-none items-center justify-center rounded-sm text-[20px] font-semibold leading-none text-[color:var(--ed-muted)] outline-none [-webkit-tap-highlight-color:transparent] hover:text-[color:var(--ed-ink)] hover:opacity-75 active:text-[color:var(--ed-ink)] active:opacity-65 disabled:pointer-events-none disabled:opacity-55 focus-visible:ring-2 focus-visible:ring-[color:var(--ed-muted)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
    >
      文
    </button>
  )
}
