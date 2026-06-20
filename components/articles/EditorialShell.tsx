import type { ReactNode } from "react"
import { cookies } from "next/headers"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { SiteHeader } from "./SiteHeader"
import { SiteFooter } from "./SiteFooter"

// Shared "Frost Editorial" frame for every public articles surface (feed,
// reader, author profile). Reads the persisted reading-theme cookie on the
// server so the initial paint matches the reader's choice with no flash, and
// exposes the editorial CSS variables + Geist (display/body) + Geist Mono (data)
// font variables on the scoped root element (#ed-root). Geist is self-hosted via
// the geist next/font package — no external font stylesheet.
export async function EditorialShell({ children }: { children: ReactNode }) {
  const cookieStore = await cookies()
  const theme = cookieStore.get("ed-theme")?.value === "dark" ? "dark" : "light"

  return (
    <div
      id="ed-root"
      data-ed-theme={theme}
      className={`${GeistSans.variable} ${GeistMono.variable} flex min-h-screen flex-col`}
      style={{ background: "var(--ed-canvas)", color: "var(--ed-body)" }}
    >
      <SiteHeader theme={theme} />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  )
}
