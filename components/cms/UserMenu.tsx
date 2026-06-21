"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { logout } from "@/actions/cms/auth"
import { UserCircle, ExternalLink, LogOut, ChevronUp } from "lucide-react"

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
}: {
  name: string | null
  email: string
  role: string
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
    "flex items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-full rounded-md border border-zinc-800 bg-zinc-900 p-1 shadow-lg">
          <Link href="/admin/profile" onClick={() => setOpen(false)} className={itemCls}>
            <UserCircle size={16} /> My profile
          </Link>
          <a href="/articles" className={itemCls}>
            <ExternalLink size={16} /> View articles
          </a>
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <LogOut size={16} /> Sign out
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-zinc-800"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs font-medium text-zinc-200">
          {initials(name, email)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm text-zinc-200">{name ?? email}</span>
          <span className="block text-xs uppercase tracking-wide text-zinc-500">{role}</span>
        </span>
        <ChevronUp size={15} className="ml-auto text-zinc-500" />
      </button>
    </div>
  )
}
