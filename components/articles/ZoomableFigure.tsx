"use client"

// Wraps a rendered article figure (a <picture>/<img> screenshot or an inline
// chart <svg>) so clicking it opens the same figure enlarged in a full-screen
// overlay. Escape or a click on the backdrop closes it. Applied only in the
// reading view (not the compact editor preview) by lib/cms/markdown.tsx.

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"

export function ZoomableFigure({ children, alt = "" }: { children: React.ReactNode; alt?: string }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, close])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Enlarge image"
        aria-haspopup="dialog"
        className="ed-zoom-trigger group relative block w-full cursor-zoom-in appearance-none border-0 bg-transparent p-0 text-left"
      >
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-black/55 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="10.5" cy="10.5" r="7" />
            <line x1="15.5" y1="15.5" x2="21" y2="21" />
            <line x1="10.5" y1="7.5" x2="10.5" y2="13.5" />
            <line x1="7.5" y1="10.5" x2="13.5" y2="10.5" />
          </svg>
        </span>
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={alt || "Enlarged image"}
              onClick={close}
              className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm sm:p-8"
            >
              <div className="ed-zoom-content max-h-full max-w-full overflow-auto" onClick={(e) => e.stopPropagation()}>
                {children}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close enlarged image"
                className="fixed right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg leading-none text-white transition-colors hover:bg-white/20"
              >
                &#10005;
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
