"use client"

import { useEffect, useRef, useState } from "react"
import { Share2, Link2, Check, Image as ImageIcon, Code2 } from "lucide-react"
import XIcon from "@/components/XIcon"
import { tweetIntentUrl, copyImageToClipboard } from "@/lib/share"
import { EmbedDialog } from "@/components/share/EmbedDialog"

const COPY = {
  en: {
    share: "Share", postOnX: "Post on X", copyLink: "Copy link", linkCopied: "Link copied",
    copyImage: "Copy image", imageCopied: "Image copied", pasteHint: "Paste it into your post (⌘/Ctrl+V)",
    embed: "Embed",
  },
  zh: {
    share: "分享", postOnX: "发到 X", copyLink: "复制链接", linkCopied: "已复制链接",
    copyImage: "复制图片", imageCopied: "图片已复制", pasteHint: "粘贴到你的帖子（⌘/Ctrl+V）",
    embed: "嵌入",
  },
} as const

/** Little share button. Opens a menu with "Post on X" (web intent) + "Copy link".
 *  - Article (link-first): X unfurls the page's OG cover, no image needed.
 *  - Card (image-first): pass `imageUrl` to enable "Copy image", and "Post on X"
 *    also copies the PNG to the clipboard so it can be pasted into the post
 *    (X can't attach images via web-intent). */
export function ShareMenu({
  url,
  text,
  locale = "en",
  align = "start",
  imageUrl,
  embedAlt,
}: {
  url: string
  /** Pre-composed tweet body (e.g. the title/stat + "@subfrost_news"). */
  text: string
  locale?: "en" | "zh"
  align?: "start" | "end"
  /** When set, enables the image-first card variant. */
  imageUrl?: string
  /** Clean alt/description for the embed snippets (card variant). Falls back to
   *  `text` with the trailing "@handle" stripped. */
  embedAlt?: string
}) {
  const t = COPY[locale]
  const isCard = Boolean(imageUrl)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<"" | "link" | "image">("")
  const [embedOpen, setEmbedOpen] = useState(false)
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
      setStatus("link")
      window.setTimeout(() => setStatus((s) => (s === "link" ? "" : s)), 1800)
    } catch {
      /* clipboard blocked (insecure context / denied) — silently no-op */
    }
  }

  async function copyImage() {
    if (!imageUrl) return
    const ok = await copyImageToClipboard(imageUrl)
    if (ok) setStatus("image")
    else window.open(imageUrl, "_blank", "noopener,noreferrer") // fallback: open so they can save it
  }

  // Cards: clicking "Post on X" also copies the image and keeps the menu open so
  // the "paste it" hint stays visible (the anchor still opens X in a new tab).
  function onPostX() {
    if (isCard) void copyImage()
    else setOpen(false)
  }

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[14px] outline-none transition-colors hover:bg-[color:var(--ed-hair)] focus-visible:bg-[color:var(--ed-hair)]"

  return (
    <>
      <div ref={ref} className="relative inline-flex">
        <button
          type="button"
          onClick={() => {
            setStatus("")
            setOpen((v) => !v)
          }}
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
            className={`absolute top-full z-30 mt-2 flex min-w-[200px] flex-col gap-0.5 rounded-xl border p-1.5 shadow-lg ${align === "end" ? "right-0" : "left-0"}`}
            style={{ borderColor: "var(--ed-hair)", background: "var(--ed-canvas)", color: "var(--ed-ink)" }}
          >
            <a
              role="menuitem"
              href={tweetIntentUrl(text, url)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onPostX}
              className={itemClass}
            >
              <XIcon className="h-[15px] w-[15px]" />
              <span>{t.postOnX}</span>
            </a>
            {isCard ? (
              <button role="menuitem" type="button" onClick={copyImage} className={itemClass}>
                {status === "image" ? (
                  <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <ImageIcon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                )}
                <span>{status === "image" ? t.imageCopied : t.copyImage}</span>
              </button>
            ) : null}
            {isCard ? (
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false)
                  setEmbedOpen(true)
                }}
                className={itemClass}
              >
                <Code2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                <span>{t.embed}</span>
              </button>
            ) : null}
            <button role="menuitem" type="button" onClick={copyLink} className={itemClass}>
              {status === "link" ? (
                <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              ) : (
                <Link2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              )}
              <span>{status === "link" ? t.linkCopied : t.copyLink}</span>
            </button>
            {isCard && status === "image" ? (
              <p className="px-3 pb-1 pt-1.5 text-[12px] leading-snug" style={{ color: "var(--ed-muted)" }}>
                {t.pasteHint}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {embedOpen && imageUrl ? (
        <EmbedDialog
          imageUrl={imageUrl}
          alt={embedAlt ?? text.replace(/\s*@\w+\s*$/, "").trim()}
          locale={locale}
          onClose={() => setEmbedOpen(false)}
        />
      ) : null}
    </>
  )
}
