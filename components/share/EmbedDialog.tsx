"use client"

import { useEffect, useId, useState } from "react"
import { X, Check, Copy } from "lucide-react"
import { embedSnippets } from "@/lib/share"

const COPY = {
  en: {
    title: "Embed", markdown: "Markdown", html: "HTML", url: "Image URL",
    copy: "Copy", copied: "Copied", close: "Close",
    autoUpdates: "Updates automatically — always shows the latest data.",
    copyAria: (fmt: string) => `Copy ${fmt}`,
  },
  zh: {
    title: "嵌入", markdown: "Markdown", html: "HTML", url: "图片链接",
    copy: "复制", copied: "已复制", close: "关闭",
    autoUpdates: "自动更新 — 始终显示最新数据。",
    copyAria: (fmt: string) => `复制 ${fmt}`,
  },
} as const

/** Modal that hands a creator ready-to-paste embed code (Markdown / HTML / raw URL)
 *  for a public, auto-updating card image, plus a small preview of what they'll get.
 *  Follows the project's inline-fixed dialog pattern (see TopSubscribeModalButton). */
export function EmbedDialog({
  imageUrl,
  alt,
  locale = "en",
  onClose,
}: {
  imageUrl: string
  alt: string
  locale?: "en" | "zh"
  onClose: () => void
}) {
  const t = COPY[locale]
  const titleId = useId()
  const snippets = embedSnippets({ imageUrl, alt })
  const [copied, setCopied] = useState<"" | "markdown" | "html" | "url">("")

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  async function copy(kind: "markdown" | "html" | "url") {
    try {
      await navigator.clipboard.writeText(snippets[kind])
      setCopied(kind)
      window.setTimeout(() => setCopied((c) => (c === kind ? "" : c)), 1800)
    } catch {
      /* clipboard blocked (insecure context / denied) — silently no-op */
    }
  }

  const fields: { kind: "markdown" | "html" | "url"; label: string }[] = [
    { kind: "markdown", label: t.markdown },
    { kind: "html", label: t.html },
    { kind: "url", label: t.url },
  ]

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={t.close}
        onClick={onClose}
        style={{ background: "color-mix(in srgb, var(--ed-ink) 18%, transparent)" }}
      />
      <div
        className="relative w-full max-w-[460px] rounded-[10px] p-6 shadow-2xl"
        style={{
          background: "var(--ed-canvas)",
          color: "var(--ed-ink)",
          border: "1px solid color-mix(in srgb, var(--ed-ink) 10%, transparent)",
        }}
      >
        <button
          type="button"
          aria-label={t.close}
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)]"
          style={{ color: "var(--ed-muted)" }}
        >
          <X className="h-4 w-4" strokeWidth={2.1} aria-hidden="true" />
        </button>

        <div id={titleId} className="font-display mb-3 text-[16px] font-medium">
          {t.title}
        </div>

        {/* Preview: exactly what will render where they paste it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={alt}
          className="mb-4 w-full rounded-md border"
          style={{ borderColor: "var(--ed-hair)" }}
        />

        <div className="flex flex-col gap-3">
          {fields.map((f) => (
            <div key={f.kind} className="flex flex-col gap-1">
              <label className="text-[12px]" style={{ color: "var(--ed-muted)" }}>
                {f.label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={snippets[f.kind]}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md border px-2.5 py-1.5 font-mono text-[12px]"
                  style={{ borderColor: "var(--ed-hair)", background: "transparent", color: "var(--ed-ink)" }}
                />
                <button
                  type="button"
                  onClick={() => copy(f.kind)}
                  aria-label={t.copyAria(f.label)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors hover:bg-[color:var(--ed-hair)]"
                  style={{ borderColor: "var(--ed-hair)", color: "var(--ed-muted)" }}
                >
                  {copied === f.kind ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  )}
                  <span>{copied === f.kind ? t.copied : t.copy}</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[12px] leading-snug" style={{ color: "var(--ed-muted)" }}>
          {t.autoUpdates}
        </p>
      </div>
    </div>
  )
}
