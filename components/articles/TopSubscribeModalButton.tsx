"use client"

import { useEffect, useMemo, useState } from "react"
import { Bell, X } from "lucide-react"
import { SubscribePanel } from "./SubscribePanel"

export function TopSubscribeModalButton({ locale }: { locale: "en" | "zh" }) {
  const [open, setOpen] = useState(false)

  const copy = useMemo(
    () =>
      locale === "zh"
        ? {
            trigger: "订阅通知",
            close: "关闭订阅窗口",
          }
        : {
            trigger: "Subscribe notifications",
            close: "Close subscribe modal",
          },
    [locale],
  )

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={copy.trigger}
        aria-label={copy.trigger}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-opacity hover:opacity-80"
        style={{
          color: "var(--ed-action-fg)",
          background: "var(--ed-action-bg)",
        }}
      >
        <Bell className="h-4 w-4" strokeWidth={2.1} />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-4 pb-6 pt-16 sm:pt-24"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-[560px] overflow-hidden rounded-[12px] border"
            style={{
              background: "var(--ed-canvas)",
              borderColor: "color-mix(in srgb, var(--ed-ink) 12%, transparent)",
            }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={copy.trigger}
          >
            <div className="flex justify-end px-4 pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={copy.close}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-opacity hover:opacity-70"
                style={{ background: "color-mix(in srgb, var(--ed-ink) 8%, transparent)", color: "var(--ed-ink)" }}
              >
                <X className="h-4 w-4" strokeWidth={2.2} />
              </button>
            </div>
            <div className="px-2 pb-3">
              <SubscribePanel locale={locale} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
