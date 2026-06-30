"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowDown, ArrowRight } from "lucide-react"
import { visibleNav, isItemActive, groupHasActive } from "@/lib/cms/admin-nav"

const STORAGE_KEY = "subfrost.adminNav.open"

function readStored(): Record<string, boolean> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function writeStored(state: Record<string, boolean>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage unavailable (private mode / disabled) — keep in-memory only
  }
}

export function AdminNav({
  privileges,
  onNavigate,
}: {
  privileges: string[]
  onNavigate?: () => void
}) {
  const pathname = usePathname() ?? ""
  // Explicit user toggles only. Read from storage after mount to avoid a
  // hydration mismatch; first render uses pathname-derived defaults.
  const [explicit, setExplicit] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setExplicit(readStored())
  }, [])

  const toggle = (key: string, hasActive: boolean) => {
    setExplicit((prev) => {
      const current = prev[key] !== undefined ? prev[key] : hasActive
      const next = { ...prev, [key]: !current }
      writeStored(next)
      return next
    })
  }

  return (
    <nav className="ed-admin-scroll min-h-0 flex-1 space-y-6 overflow-y-auto pr-1 text-sm">
      {visibleNav(privileges).map((group) => {
        const hasActive = groupHasActive(group, pathname)
        const open = explicit[group.key] !== undefined ? explicit[group.key] : hasActive
        return (
          <div key={group.key}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggle(group.key, hasActive)}
              className="flex w-full items-center gap-2 py-1 text-[color:var(--ed-muted)] outline-none transition-colors hover:text-[color:var(--ed-ink)] focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)]"
            >
              <span>{group.label}</span>
              <span className="ml-auto flex items-center gap-1.5">
                {!open && hasActive && (
                  <span data-active-marker="true" className="h-1.5 w-1.5 rounded-full bg-[color:var(--ed-ice)]" aria-hidden />
                )}
                {open ? (
                  <ArrowDown size={14} className="text-[color:var(--ed-muted)] transition-transform duration-300" />
                ) : (
                  <ArrowRight size={14} className="text-[color:var(--ed-muted)] transition-transform duration-300" />
                )}
              </span>
            </button>
            {open && (
              <div className="ed-admin-reveal mt-2 space-y-1">
                {group.items.map((item) => {
                  const active = isItemActive(item.href, pathname)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2 py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)] ${
                        active
                          ? "font-medium text-[color:var(--ed-ink)]"
                          : "text-[color:var(--ed-muted)] hover:text-[color:var(--ed-ink)]"
                      }`}
                    >
                      <span className="flex-1">{item.label}</span>
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--ed-ink)]" aria-hidden />}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}
