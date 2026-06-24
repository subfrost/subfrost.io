"use client"

import { useState } from "react"
import Image from "next/image"
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
    <a href="/admin" className="block px-2" aria-label="subfrost admin">
      <Image
        src="/brand/subfrost/Logos/svg/logotype/logotype_light.svg"
        width={148}
        height={30}
        alt="subfrost"
        className="h-7 w-auto"
        priority
      />
      <div className="mt-3 text-[13px] font-normal text-[#7f93aa]">Admin</div>
    </a>
  )

  const body = (onNavigate?: () => void) => (
    <>
      <AdminNav privileges={user.privileges} onNavigate={onNavigate} />
      <div className="mt-5 border-t border-white/10 pt-5">
        <UserMenu name={user.name} email={user.email} role={user.role} />
      </div>
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-[#07111f] text-[#e9f0f7]">
      {/* Desktop sidebar */}
      <aside className="hidden w-[272px] flex-col border-r border-white/10 bg-[#07111f] p-5 md:flex">
        <div className="mb-8">{brand}</div>
        {body()}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-[292px] flex-col border-r border-white/10 bg-[#07111f] p-5">
            <div className="mb-8 flex items-start justify-between">
              {brand}
              <button
                onClick={() => setOpen(false)}
                className="rounded-[6px] p-1 text-[#a7b6c8] outline-none focus-visible:ring-2 focus-visible:ring-[#a7c6dc]"
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
        <header className="flex items-center gap-3 border-b border-white/10 bg-[#07111f] px-4 py-4 md:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded-[6px] p-1 text-[#a7b6c8] outline-none focus-visible:ring-2 focus-visible:ring-[#a7c6dc]"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <Image
            src="/brand/subfrost/Logos/svg/logotype/logotype_light.svg"
            width={132}
            height={28}
            alt="subfrost"
            className="h-7 w-auto"
            priority
          />
        </header>
        <main className="flex-1 overflow-y-auto bg-[#f7fafc] p-5 text-[#07111f] md:p-8">{children}</main>
      </div>
    </div>
  )
}
