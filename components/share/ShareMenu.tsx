"use client"

import { useEffect, useRef, useState } from "react"
import { Share2, Link2, Check } from "lucide-react"
import XIcon from "@/components/XIcon"
import { tweetIntentUrl } from "@/lib/share"

const COPY = {
  en: { share: "Share", postOnX: "Post on X", copyLink: "Copy link", copied: "Link copied" },
  zh: { share: "分享", postOnX: "发到 X", copyLink: "复制链接", copied: "已复制链接" },
} as const

/** Little share button. Opens a menu with "Post on X" (web intent — X unfurls the
 *  page's OG image) and "Copy link". Link-first variant used on articles; the
 *  /metrics cards will add an image-first "Copy image" action on top of this. */
export function ShareMenu({
  url,
  text,
  locale = "en",
  align = "start",
}: {
  url: string
  /** Pre-composed tweet body (e.g. the title/stat + "@subfrost_news"). */
  text: string
  locale?: "en" | "zh"
  align?: "start" | "end"
}) {
  const t = COPY[locale]
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("mousedown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("mousedown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked (insecure context / denied) — silently no-op */
    }
  }

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[14px] outline-none transition-colors hover:bg-[color:var(--ed-hair)] focus-visible:bg-[color:var(--ed-hair)]"

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="font-display inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium outline-none transition-colors hover:text-[color:var(--ed-ink)] focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
        style={{ borderColor: "var(--ed-hair)", color: "var(--ed-muted)" }}
      >
        <Share2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        <span>{t.share}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute top-full z-30 mt-2 flex min-w-[184px] flex-col gap-0.5 rounded-xl border p-1.5 shadow-lg ${align === "end" ? "right-0" : "left-0"}`}
          style={{ borderColor: "var(--ed-hair)", background: "var(--ed-canvas)", color: "var(--ed-ink)" }}
        >
          <a
            role="menuitem"
            href={tweetIntentUrl(text, url)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <XIcon className="h-[15px] w-[15px]" />
            <span>{t.postOnX}</span>
          </a>
          <button role="menuitem" type="button" onClick={copyLink} className={itemClass}>
            {copied ? (
              <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            ) : (
              <Link2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            )}
            <span>{copied ? t.copied : t.copyLink}</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
