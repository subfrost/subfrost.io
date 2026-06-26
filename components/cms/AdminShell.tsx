"use client"

import { useState } from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"
import { AdminNav } from "@/components/cms/AdminNav"
import { UserMenu } from "@/components/cms/UserMenu"
import { SystemThemeSync } from "@/components/articles/SystemThemeSync"
import { ThemeToggle } from "@/components/articles/ThemeToggle"

export interface ShellUser {
  name: string | null
  email: string
  role: string
  privileges: string[]
  avatarUrl?: string | null
  status?: string | null
}

export function AdminShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname() ?? ""
  const immersiveEditor =
    pathname === "/admin/articles/new" ||
    (/^\/admin\/articles\/[^/]+$/.test(pathname) && pathname !== "/admin/articles/new")

  const brand = (
    <a href="/admin" className="block outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)]" aria-label="subfrost admin">
      <span className="relative block h-8 w-[142px]">
        <Image
          src="/brand/subfrost/Logos/svg/logotype/logotype_dark.svg"
          width={142}
          height={30}
          alt="subfrost"
          className="ed-logo-light h-8 w-auto"
          priority
        />
        <Image
          src="/brand/subfrost/Logos/svg/logotype/logotype_light.svg"
          width={148}
          height={30}
          alt=""
          aria-hidden="true"
          className="ed-logo-dark absolute inset-0 h-8 w-auto"
          priority
        />
      </span>
    </a>
  )

  const body = (onNavigate?: () => void) => (
    <>
      <AdminNav privileges={user.privileges} onNavigate={onNavigate} />
      <div className="mt-10">
        <UserMenu name={user.name} email={user.email} role={user.role} avatarUrl={user.avatarUrl} status={user.status} />
      </div>
    </>
  )

  if (immersiveEditor) {
    return (
      <div
        id="ed-root"
        data-ed-theme="light"
        className="flex h-screen overflow-hidden bg-[color:var(--ed-canvas)] font-display text-[color:var(--ed-ink)]"
      >
        <SystemThemeSync />
        <main className="ed-admin-scroll relative flex-1 overflow-y-auto bg-[color:var(--ed-canvas)] text-[color:var(--ed-ink)]">
          <div className="px-5 py-8 md:px-8 lg:px-12 lg:py-12">{children}</div>
        </main>
      </div>
    )
  }

  return (
    <div
      id="ed-root"
      data-ed-theme="light"
      className="flex h-screen overflow-hidden bg-[color:var(--ed-canvas)] font-display text-[color:var(--ed-ink)]"
    >
      <SystemThemeSync />
      {/* Desktop sidebar */}
      <aside className="ed-admin-scroll hidden w-[220px] shrink-0 flex-col overflow-y-auto bg-[color:var(--ed-canvas)] px-6 py-5 lg:flex">
        <div className="mb-9">{brand}</div>
        {body()}
      </aside>

      {/* Mobile drawer - always mounted so it can slide/fade both ways */}
      <div
        className={`fixed inset-0 z-40 lg:hidden ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <div
          className={`absolute inset-0 bg-black/35 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
          onClick={() => setOpen(false)}
        />
        <aside
          className={`ed-admin-scroll absolute left-0 top-0 flex h-full w-[296px] flex-col overflow-y-auto border-r border-[color:var(--ed-hair)] bg-[color:var(--ed-canvas)] p-5 shadow-[20px_0_70px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="mb-8 flex items-start justify-between">
            {brand}
            <button
              onClick={() => setOpen(false)}
              className="rounded-[6px] p-1 text-[color:var(--ed-muted)] outline-none hover:text-[color:var(--ed-ink)] focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)]"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>
          {body(() => setOpen(false))}
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b border-[color:var(--ed-hair)] bg-[color:var(--ed-canvas)] px-4 py-4 lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded-[6px] p-1 text-[color:var(--ed-muted)] outline-none hover:text-[color:var(--ed-ink)] focus-visible:ring-2 focus-visible:ring-[color:var(--ed-ice)]"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <a href="/admin" className="relative block h-8 w-[132px]" aria-label="subfrost admin">
            <Image
              src="/brand/subfrost/Logos/svg/logotype/logotype_dark.svg"
              width={132}
              height={28}
              alt="subfrost"
              className="ed-logo-light h-8 w-auto"
              priority
            />
            <Image
              src="/brand/subfrost/Logos/svg/logotype/logotype_light.svg"
              width={132}
              height={28}
              alt=""
              aria-hidden="true"
              className="ed-logo-dark absolute inset-0 h-8 w-auto"
              priority
            />
          </a>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main className="ed-admin-scroll relative flex-1 overflow-y-auto bg-[color:var(--ed-canvas)] text-[color:var(--ed-ink)]">
          <div className="absolute right-8 top-6 z-10 hidden lg:block">
            <ThemeToggle />
          </div>
          <div className="px-5 py-8 md:px-8 lg:px-12 lg:py-12">{children}</div>
        </main>
      </div>
    </div>
  )
}
