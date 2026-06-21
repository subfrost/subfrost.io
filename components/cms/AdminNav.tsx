"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"
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
    <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto text-sm">
      {visibleNav(privileges).map((group) => {
        const hasActive = groupHasActive(group, pathname)
        const open = explicit[group.key] !== undefined ? explicit[group.key] : hasActive
        const GroupIcon = group.icon
        return (
          <div key={group.key}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggle(group.key, hasActive)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <GroupIcon size={16} />
              <span className="font-medium">{group.label}</span>
              <span className="ml-auto flex items-center gap-1.5">
                {!open && hasActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400" aria-hidden />
                )}
                <ChevronRight
                  size={14}
                  className={`text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`}
                />
              </span>
            </button>
            {open && (
              <div className="ml-3 mt-1 space-y-1 border-l border-zinc-800 pl-3">
                {group.items.map((item) => {
                  const active = isItemActive(item.href, pathname)
                  const ItemIcon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2 rounded-md px-2 py-2 ${
                        active
                          ? "bg-sky-500/10 text-sky-300"
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      }`}
                    >
                      <ItemIcon size={15} />
                      {item.label}
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
