"use client"

import { useState, type ReactNode } from "react"

export interface ProfileTab {
  key: string
  label: string
}

// Content tabs for the project profile page. Panels arrive fully rendered from
// the server (Markdown stays server-side); this component only switches them.
export function ProfileTabs({ tabs, panels }: { tabs: ProfileTab[]; panels: ReactNode[] }) {
  const [active, setActive] = useState(0)
  const idx = active < tabs.length ? active : 0
  return (
    <div>
      <div role="tablist" aria-label="Profile sections" className="flex gap-6 overflow-x-auto border-b border-[color:var(--ed-hair)]">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={idx === i}
            onClick={() => setActive(i)}
            className={
              "-mb-px whitespace-nowrap border-b-2 pb-3 font-mono text-[12.5px] font-medium tracking-[0.04em] transition-colors " +
              (idx === i
                ? "border-[color:var(--ed-ink)] text-[color:var(--ed-ink)]"
                : "border-transparent text-[color:var(--ed-muted)] hover:text-[color:var(--ed-accent)]")
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-6">{panels[idx]}</div>
    </div>
  )
}
