"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { logout } from "@/actions/cms/auth"
import { ArrowUpRight, ExternalLink, LogOut } from "lucide-react"

function initials(name: string | null, email: string): string {
  const src = (name ?? email).trim()
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

export function UserMenu({
  name,
  email,
  role,
  avatarUrl,
  status,
}: {
  name: string | null
  email: string
  role: string
  avatarUrl?: string | null
  status?: string | null
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const itemCls =
    "group flex items-center justify-between gap-2 rounded-[6px] px-2 py-2 text-sm text-[color:var(--ed-body)] outline-none transition-colors hover:bg-[color:var(--ed-surface)] hover:text-[color:var(--ed-ink)] focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)]"

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="ed-admin-reveal absolute bottom-full left-0 mb-3 w-full rounded-[8px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-canvas)] p-1 shadow-[0_20px_50px_rgba(7,17,31,0.14)]">
          <Link href="/admin/profile" onClick={() => setOpen(false)} className={itemCls}>
            <span>Profile</span>
            <ArrowUpRight size={13} className="opacity-45 transition-[opacity,transform] duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
          </Link>
          <a href="/articles" onClick={() => setOpen(false)} className={itemCls}>
            <span>View articles</span>
            <ExternalLink size={13} className="opacity-45 transition-opacity duration-300 group-hover:opacity-100" />
          </a>
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center justify-between gap-2 rounded-[6px] px-2 py-2 text-sm text-[color:var(--ed-muted)] outline-none transition-colors hover:bg-[color:var(--ed-surface)] hover:text-[color:var(--ed-ink)] focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)]"
            >
              <span>Sign out</span>
              <LogOut size={13} />
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="group flex w-full items-center gap-3 rounded-[6px] py-2 text-left outline-none transition-colors hover:text-[color:var(--ed-ink)] focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)]"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--ed-surface)] text-xs font-medium text-[color:var(--ed-ink)]">
            {initials(name, email)}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm text-[color:var(--ed-ink)]">{name ?? email}</span>
          <span className="block truncate text-xs text-[color:var(--ed-muted)]">{status || role}</span>
        </span>
        <ArrowUpRight size={13} className="ml-auto text-[color:var(--ed-muted)] opacity-45 transition-[opacity,transform] duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
      </button>
    </div>
  )
}
