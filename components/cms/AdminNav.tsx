"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowDown, ArrowRight, Folder } from "lucide-react"
import { visibleNav, isItemActive, groupHasActive } from "@/lib/cms/admin-nav"
import type { NavTreeDrive, NavTreeNode } from "@/lib/files/manager"

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
  filesTree = [],
}: {
  privileges: string[]
  onNavigate?: () => void
  filesTree?: NavTreeDrive[]
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
                    <div key={item.href}>
                      <Link
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
                      {item.href === "/admin/files" && filesTree.length > 0 && (
                        <FilesTree tree={filesTree} pathname={pathname} onNavigate={onNavigate} />
                      )}
                    </div>
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

// Collapsible 2-level folder tree rendered under the Files nav item. Drives
// (SUBFROST / OYL) → root folders → their immediate children. Deeper navigation
// happens in the explorer. Open state is local + auto-opens the active path.
function FilesTree({ tree, pathname, onNavigate }: { tree: NavTreeDrive[]; pathname: string; onNavigate?: () => void }) {
  return (
    <div className="mt-1 space-y-0.5 border-l border-[color:var(--ed-hair)] pl-2">
      {tree.map((drive) => (
        <TreeRow
          key={drive.slug}
          label={drive.label}
          href={drive.path}
          children_={drive.children}
          pathname={pathname}
          onNavigate={onNavigate}
          depth={0}
        />
      ))}
    </div>
  )
}

function TreeRow({
  label, href, children_, pathname, onNavigate, depth,
}: {
  label: string; href: string; children_: NavTreeNode[]; pathname: string; onNavigate?: () => void; depth: number
}) {
  const onPath = pathname === href || pathname.startsWith(href + "/")
  const [open, setOpen] = useState(onPath)
  const hasChildren = children_.length > 0
  return (
    <div>
      <div className="flex items-center gap-1" style={{ paddingLeft: depth * 8 }}>
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 text-[color:var(--ed-muted)] hover:text-[color:var(--ed-ink)]"
          >
            {open ? <ArrowDown size={12} /> : <ArrowRight size={12} />}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Link
          href={href}
          onClick={onNavigate}
          className={`flex min-w-0 flex-1 items-center gap-1.5 truncate py-1 text-xs transition-colors ${
            onPath ? "font-medium text-[color:var(--ed-ink)]" : "text-[color:var(--ed-muted)] hover:text-[color:var(--ed-ink)]"
          }`}
        >
          <Folder size={12} className="shrink-0 text-amber-400/70" />
          <span className="truncate">{label}</span>
        </Link>
      </div>
      {open && hasChildren && (
        <div className="space-y-0.5">
          {children_.map((c) => (
            <TreeRow
              key={c.path}
              label={c.name}
              href={c.path}
              children_={c.children}
              pathname={pathname}
              onNavigate={onNavigate}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
