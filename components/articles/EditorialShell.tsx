import type { ReactNode } from "react"
import { Suspense } from "react"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { SiteHeader } from "./SiteHeader"
import { SiteFooter } from "./SiteFooter"
import { SmoothPageTransitions } from "./SmoothPageTransitions"
import { SystemThemeSync } from "./SystemThemeSync"

// Shared "Frost Editorial" frame for every public articles surface (feed,
// reader, author profile). Exposes the editorial CSS variables + Geist
// (display/body) + Geist Mono (data) font variables on the scoped root element
// (#ed-root). Theme follows the user's OS preference client-side.
export function EditorialShell({ children }: { children: ReactNode }) {
  return (
    <div
      id="ed-root"
      data-ed-theme="light"
      className={`${GeistSans.variable} ${GeistMono.variable} flex min-h-screen flex-col`}
      style={{
        background: "var(--ed-canvas)",
        color: "var(--ed-body)",
      }}
    >
      <SystemThemeSync />
      <Suspense fallback={null}>
        <SmoothPageTransitions />
      </Suspense>
      <Suspense fallback={null}>
        <SiteHeader />
      </Suspense>
      <div className="flex-1">{children}</div>
      <Suspense fallback={null}>
        <SiteFooter />
      </Suspense>
    </div>
  )
}
