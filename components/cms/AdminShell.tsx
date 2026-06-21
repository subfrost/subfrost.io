"use client"

import { useState } from "react"
import { Menu, X } from "lucide-react"
import { AdminNav } from "@/components/cms/AdminNav"
import { UserMenu } from "@/components/cms/UserMenu"

export interface ShellUser {
  name: string | null
  email: string
  role: string
  privileges: string[]
}

export function AdminShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  const brand = (
    <div className="px-2">
      <div className="text-lg font-bold text-white">SUBFROST</div>
      <div className="text-xs uppercase tracking-widest text-zinc-500">Editorial</div>
    </div>
  )

  const body = (onNavigate?: () => void) => (
    <>
      <AdminNav privileges={user.privileges} onNavigate={onNavigate} />
      <div className="mt-4 border-t border-zinc-800 pt-4">
        <UserMenu name={user.name} email={user.email} role={user.role} />
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 flex-col border-r border-zinc-800 bg-zinc-900/40 p-4 md:flex">
        <div className="mb-6">{brand}</div>
        {body()}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-6 flex items-center justify-between">
              {brand}
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>
            {body(() => setOpen(false))}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900/40 px-4 py-3 md:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded-md p-1 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <span className="font-bold text-white">SUBFROST</span>
        </header>
        <main className="flex-1 overflow-y-auto p-5 md:p-8">{children}</main>
      </div>
    </div>
  )
}
