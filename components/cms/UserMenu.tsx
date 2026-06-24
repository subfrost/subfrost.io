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
    "flex items-center gap-2 rounded-[6px] px-2 py-2 text-sm text-[#d7e1eb] outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[#a7c6dc]"

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-full rounded-[6px] border border-white/10 bg-[#0b1726] p-1 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
          <Link href="/admin/profile" onClick={() => setOpen(false)} className={itemCls}>
            <UserCircle size={16} /> My profile
          </Link>
          <a href="/articles" onClick={() => setOpen(false)} className={itemCls}>
            <ExternalLink size={16} /> View articles
          </a>
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-[6px] px-2 py-2 text-sm text-[#93a6bb] outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[#a7c6dc]"
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
        className="flex w-full items-center gap-3 rounded-[6px] px-2 py-2 text-left outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[#a7c6dc]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-xs font-medium text-[#e9f0f7]">
          {initials(name, email)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm text-[#e9f0f7]">{name ?? email}</span>
          <span className="block text-xs text-[#7f93aa]">{role}</span>
        </span>
        <ChevronUp size={15} className="ml-auto text-[#667b92]" />
      </button>
    </div>
  )
}
