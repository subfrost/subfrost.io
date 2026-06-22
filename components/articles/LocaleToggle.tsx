"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

// The same single-glyph 文 translation button used across subfrost.io and
// app.subfrost.io. Drives the reading language via the editorial `?lang=` SSR
// routing (en↔zh). Self-contained so it can live in the shared SiteHeader on
// every editorial surface; the article fetch falls back to the primary
// translation when the requested locale is missing (lib/cms/articles
// chooseTranslation), so a missing locale never 404s.
export function LocaleToggle() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const isZh = params.get("lang") === "zh"

  function toggle() {
    const next = isZh ? "en" : "zh"
    const p = new URLSearchParams(params.toString())
    p.set("lang", next)
    router.push(`${pathname}?${p.toString()}`, { scroll: false })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${isZh ? "English" : "Chinese"}`}
      className="rounded-sm text-base font-bold leading-none outline-none transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
      style={{ color: isZh ? "var(--ed-accent)" : "var(--ed-muted)" }}
    >
      文
    </button>
  )
}
