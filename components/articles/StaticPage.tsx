import type { ReactNode } from "react"
import { EditorialShell } from "./EditorialShell"

export function StaticPage({
  title,
  description,
  updated,
  children,
}: {
  title: string
  description?: string
  updated?: string
  children: ReactNode
}) {
  return (
    <EditorialShell>
      <main className="relative overflow-hidden">
        <section style={{ background: "var(--ed-canvas)" }}>
          <div className="mx-auto max-w-[1440px] px-6 pb-14 pt-10 sm:px-8 sm:pb-20 sm:pt-[66px]">
            <div className="max-w-[920px]">
              <h1 className="font-display text-balance text-[44px] font-normal leading-none sm:text-[64px]" style={{ color: "var(--ed-ink)" }}>
                {title}
              </h1>
              {description ? (
                <p className="font-display mt-6 max-w-[760px] text-[18px] leading-[1.5] sm:text-[21px]" style={{ color: "var(--ed-body)" }}>
                  {description}
                </p>
              ) : null}
              {updated ? (
                <p className="font-display mt-7 text-[14px] font-medium" style={{ color: "var(--ed-muted)" }}>
                  Last updated: {updated}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto grid max-w-[1440px] gap-10 px-6 pb-16 sm:px-8 sm:pb-24 lg:grid-cols-[300px_minmax(0,760px)]">
            <aside className="hidden lg:block">
              <p className="font-display sticky top-28 text-[14px] font-medium" style={{ color: "var(--ed-muted)" }}>
                subfrost.io
              </p>
            </aside>
            <article className="ed-static-prose">{children}</article>
          </div>
        </section>
      </main>
    </EditorialShell>
  )
}
