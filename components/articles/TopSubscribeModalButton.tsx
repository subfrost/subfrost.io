"use client"

import { useEffect, useId, useState } from "react"
import { Bell, X } from "lucide-react"
import { SubscribePanel } from "./SubscribePanel"

export function TopSubscribeModalButton({ locale }: { locale: "en" | "zh" }) {
  const [open, setOpen] = useState(false)
  const titleId = useId()

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open])

  const label = locale === "zh" ? "订阅通知" : "Subscribe notifications"

  return (
    <>
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ed-canvas)]"
        style={{
          color: "var(--ed-action-fg)",
          background: "var(--ed-action-bg)",
        }}
      >
        <Bell className="h-4 w-4" strokeWidth={2.1} aria-hidden="true" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label={locale === "zh" ? "关闭订阅窗口" : "Close subscribe dialog"}
            onClick={() => setOpen(false)}
            style={{ background: "color-mix(in srgb, var(--ed-ink) 18%, transparent)" }}
          />
          <div
            className="relative w-full max-w-[360px] rounded-[10px] p-6 shadow-2xl"
            style={{
              background: "var(--ed-canvas)",
              color: "var(--ed-ink)",
              border: "1px solid color-mix(in srgb, var(--ed-ink) 10%, transparent)",
            }}
          >
            <button
              type="button"
              aria-label={locale === "zh" ? "关闭" : "Close"}
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)]"
              style={{ color: "var(--ed-muted)" }}
            >
              <X className="h-4 w-4" strokeWidth={2.1} aria-hidden="true" />
            </button>
            <div id={titleId} className="sr-only">
              {label}
            </div>
            <SubscribePanel locale={locale} footer centered />
          </div>
        </div>
      ) : null}
    </>
  )
}
