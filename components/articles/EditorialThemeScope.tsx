import type { ReactNode } from "react"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { SystemThemeSync } from "./SystemThemeSync"

// The "Frost Editorial" theme scope. The editorial CSS variables (--ed-ink,
// --ed-canvas, --ed-muted, …) and the `.ed-article-prose` styles are declared
// in globals.css *under [data-ed-theme]*, so any surface that renders an
// <ArticleView> must live inside an element carrying that attribute — otherwise
// var(--ed-ink) doesn't resolve and the text inherits the surrounding theme
// (e.g. the dark admin shell), rendering it invisible/washed out.
//
// The public article pages get this via EditorialShell (which also adds the
// site header/footer). This component is the chrome-less scope for editorial
// surfaces rendered *outside* that shell — notably the admin full-page preview —
// so the preview matches the published page: editorial canvas background, ink
// text, Geist typography.
//
// `followSystemTheme` mounts the same SystemThemeSync the public shell uses, so
// the surface tracks the reader's light/dark preference (id="ed-root" is the
// element SystemThemeSync flips). Leave it off for a deterministic light scope.
export function EditorialThemeScope({
  children,
  className,
  followSystemTheme = false,
}: {
  children: ReactNode
  className?: string
  followSystemTheme?: boolean
}) {
  return (
    <div
      id={followSystemTheme ? "ed-root" : undefined}
      data-ed-theme="light"
      className={`${GeistSans.variable} ${GeistMono.variable}${className ? ` ${className}` : ""}`}
      style={{ background: "var(--ed-canvas)", color: "var(--ed-body)" }}
    >
      {followSystemTheme ? <SystemThemeSync /> : null}
      {children}
    </div>
  )
}
