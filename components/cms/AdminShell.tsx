"use client"

import { useState } from "react"
import Link from "next/link"
import { logout } from "@/actions/cms/auth"
import {
  FileText, Users, PlusCircle, LogOut, KeyRound, UserCircle, ScrollText, Ticket, Fuel, ShieldCheck, Menu, X,
} from "lucide-react"

export interface ShellUser {
  name: string | null
  email: string
  role: string
  privileges: string[]
}

export function AdminShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const can = (p: string) => user.privileges.includes(p)

  const nav = (
    <nav className="flex-1 space-y-1 text-sm" onClick={() => setOpen(false)}>
      <NavItem href="/admin" icon={<FileText size={16} />}>Articles</NavItem>
      <NavItem href="/admin/articles/new" icon={<PlusCircle size={16} />}>New article</NavItem>
      <NavItem href="/admin/profile" icon={<UserCircle size={16} />}>My profile</NavItem>
      {can("MANAGE_API_KEYS") && <NavItem href="/admin/api-keys" icon={<KeyRound size={16} />}>API keys</NavItem>}
      {can("MANAGE_USERS") && <NavItem href="/admin/users" icon={<Users size={16} />}>Users</NavItem>}
      {can("MANAGE_REFERRAL_CODES") && <NavItem href="/admin/codes" icon={<Ticket size={16} />}>Referral codes</NavItem>}
      {can("MANAGE_FUEL") && <NavItem href="/admin/fuel" icon={<Fuel size={16} />}>FUEL</NavItem>}
      {can("MANAGE_AML") && <NavItem href="/admin/kyc" icon={<ShieldCheck size={16} />}>KYC review</NavItem>}
      {can("VIEW_AUDIT") && <NavItem href="/admin/audit" icon={<ScrollText size={16} />}>Audit log</NavItem>}
    </nav>
  )

  const footer = (
    <div className="mt-4 border-t border-zinc-800 pt-4">
      <div className="px-2 text-sm text-zinc-300">{user.name ?? user.email}</div>
      <div className="px-2 text-xs uppercase tracking-wide text-zinc-500">{user.role}</div>
      <form action={logout} className="mt-3">
        <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white">
          <LogOut size={16} /> Sign out
        </button>
      </form>
      <a href="/articles" className="mt-1 block px-2 text-xs text-zinc-600 hover:text-zinc-400">View articles ↗</a>
    </div>
  )

  const brand = (
    <div className="px-2">
      <div className="text-lg font-bold text-white">SUBFROST</div>
      <div className="text-xs uppercase tracking-widest text-zinc-500">Editorial</div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 flex-col border-r border-zinc-800 bg-zinc-900/40 p-4 md:flex">
        <div className="mb-6">{brand}</div>
        {nav}
        {footer}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-6 flex items-center justify-between">
              {brand}
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label="Close menu"><X size={18} /></button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900/40 px-4 py-3 md:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-1 text-zinc-300 hover:bg-zinc-800 hover:text-white" aria-label="Open menu"><Menu size={20} /></button>
          <span className="font-bold text-white">SUBFROST</span>
        </header>
        <main className="flex-1 overflow-y-auto p-5 md:p-8">{children}</main>
      </div>
    </div>
  )
}

function NavItem({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-md px-2 py-2 text-zinc-400 hover:bg-zinc-800 hover:text-white">
      {icon}
      {children}
    </Link>
  )
}
