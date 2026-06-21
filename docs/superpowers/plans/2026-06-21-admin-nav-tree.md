# Admin nav tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the flat `/admin` sidebar into an expandable 5-group tree and move "My profile" into a user-button popover, with privilege gating, active-route auto-expand, and localStorage persistence.

**Architecture:** A pure data+helpers module (`lib/cms/admin-nav.ts`) holds the nav shape and the gating/active-matching logic with no React. A client `AdminNav` component renders the tree from that data (expand/collapse state in `useState` + localStorage, active route via `usePathname`). A client `UserMenu` component renders the footer account popover. `AdminShell` is refactored to compose both in the desktop sidebar and the mobile drawer. 100% frontend; no routes, schema, or server actions change.

**Tech Stack:** Next.js 16 App Router, React (client components), TypeScript, Tailwind (zinc dark theme), lucide-react icons, vitest + happy-dom + @testing-library/react.

## Global Constraints

- Windows host. Primary shell is PowerShell; the Bash tool is available for POSIX/heredoc. `node_modules/.bin/*` for local bins. Package manager: pnpm.
- Run a single vitest file: PowerShell `$env:CI='true'; node_modules/.bin/vitest run <file>` (or via the Bash tool: `CI=true node_modules/.bin/vitest run <file>`). `CI=true` forces a single non-watch run.
- Typecheck: `node_modules/.bin/tsc --noEmit`. Build: `node_modules/.bin/next build`.
- **NEVER `git add .npmrc`** (untracked, must stay untracked). Never `git add .` — add exact paths only. `.claude/` is also untracked and must not be committed.
- Work stays on branch `feat/admin-nav-tree` (already created). Integration is branch → PR → merge to `main`; no direct pushes to `main`.
- Privilege strings are the `Privilege` enum values from `@prisma/client` (see `lib/cms/privileges.ts`): `WRITE_ARTICLES, EDIT_ANY_ARTICLE, PUBLISH_ARTICLES, EDIT_BIO, MANAGE_API_KEYS, VIEW_AUDIT, MANAGE_USERS, MANAGE_ROLES, MANAGE_REFERRAL_CODES, MANAGE_FUEL, MANAGE_AML, MANAGE_BILLING`.
- Match the existing dark theme Tailwind classes used in `AdminShell` (`text-zinc-400`, `hover:bg-zinc-800 hover:text-white`, `border-zinc-800`, etc.).
- No schema change → no `prisma migrate diff` / migrate-job concern.

---

### Task 1: Nav config + helpers (`lib/cms/admin-nav.ts`)

The pure, React-free core: the nav shape as data, plus `visibleNav` (privilege gating, drops empty groups) and `isItemActive` (active-route matching). Fully unit-testable without a DOM.

**Files:**
- Create: `lib/cms/admin-nav.ts`
- Test: `tests/cms/admin-nav.test.ts`

**Interfaces:**
- Consumes: `Privilege` type from `@prisma/client`; `LucideIcon` from `lucide-react`.
- Produces:
  - `interface NavLeaf { label: string; href: string; icon: LucideIcon; privilege?: Privilege }`
  - `interface NavGroup { key: string; label: string; icon: LucideIcon; items: NavLeaf[] }`
  - `const NAV_GROUPS: NavGroup[]`
  - `function visibleNav(privileges: string[]): NavGroup[]`
  - `function isItemActive(href: string, pathname: string): boolean`
  - `function groupHasActive(group: NavGroup, pathname: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/cms/admin-nav.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { visibleNav, isItemActive, NAV_GROUPS } from "@/lib/cms/admin-nav"
import { ALL_PRIVILEGES } from "@/lib/cms/privileges"

describe("visibleNav", () => {
  it("shows only the Articles group when there are no privileges", () => {
    const groups = visibleNav([])
    expect(groups.map((g) => g.key)).toEqual(["articles"])
    expect(groups[0].items.map((i) => i.href)).toEqual(["/admin", "/admin/articles/new"])
  })

  it("shows Articles + Compliance (3 items) for a MANAGE_AML-only user", () => {
    const groups = visibleNav(["MANAGE_AML"])
    expect(groups.map((g) => g.key)).toEqual(["articles", "compliance"])
    const compliance = groups.find((g) => g.key === "compliance")!
    expect(compliance.items.map((i) => i.href)).toEqual([
      "/admin/kyc", "/admin/fincen", "/admin/mtl",
    ])
  })

  it("shows all 5 groups for ADMIN (all privileges)", () => {
    const groups = visibleNav([...ALL_PRIVILEGES])
    expect(groups.map((g) => g.key)).toEqual([
      "articles", "community", "compliance", "billing", "settings",
    ])
    expect(groups.find((g) => g.key === "billing")!.items).toHaveLength(8)
  })

  it("never returns a group with zero items", () => {
    for (const g of visibleNav(["MANAGE_FUEL"])) {
      expect(g.items.length).toBeGreaterThan(0)
    }
  })

  it("does not mutate NAV_GROUPS", () => {
    const before = NAV_GROUPS.find((g) => g.key === "billing")!.items.length
    visibleNav([])
    expect(NAV_GROUPS.find((g) => g.key === "billing")!.items.length).toBe(before)
  })
})

describe("isItemActive", () => {
  it("matches the articles list exactly on /admin", () => {
    expect(isItemActive("/admin", "/admin")).toBe(true)
  })
  it("keeps the articles list active while editing an article", () => {
    expect(isItemActive("/admin", "/admin/articles/abc123")).toBe(true)
  })
  it("does not mark the articles list active on the new-article page", () => {
    expect(isItemActive("/admin", "/admin/articles/new")).toBe(false)
    expect(isItemActive("/admin/articles/new", "/admin/articles/new")).toBe(true)
  })
  it("matches billing overview exactly, not its sub-pages", () => {
    expect(isItemActive("/admin/billing", "/admin/billing")).toBe(true)
    expect(isItemActive("/admin/billing", "/admin/billing/treasury")).toBe(false)
    expect(isItemActive("/admin/billing/treasury", "/admin/billing/treasury")).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:CI='true'; node_modules/.bin/vitest run tests/cms/admin-nav.test.ts`
Expected: FAIL — cannot resolve `@/lib/cms/admin-nav` (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `lib/cms/admin-nav.ts`:

```ts
import {
  FileText, PlusCircle, Megaphone, Fuel, Ticket, ShieldCheck, MapPin,
  CreditCard, LayoutGrid, Repeat, Tag, Landmark, ArrowLeftRight, Users,
  ClipboardList, Settings, KeyRound, ScrollText,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { Privilege } from "@prisma/client"

export interface NavLeaf {
  label: string
  href: string
  icon: LucideIcon
  privilege?: Privilege
}

export interface NavGroup {
  key: string
  label: string
  icon: LucideIcon
  items: NavLeaf[]
}

// The full nav tree. Articles is ungated (it is the /admin landing). Every other
// leaf names the privilege that unlocks it; visibleNav() drops empty groups.
export const NAV_GROUPS: NavGroup[] = [
  {
    key: "articles", label: "Articles", icon: FileText, items: [
      { label: "All articles", href: "/admin", icon: FileText },
      { label: "New article", href: "/admin/articles/new", icon: PlusCircle },
    ],
  },
  {
    key: "community", label: "Community", icon: Megaphone, items: [
      { label: "FUEL", href: "/admin/fuel", icon: Fuel, privilege: "MANAGE_FUEL" },
      { label: "Referral codes", href: "/admin/codes", icon: Ticket, privilege: "MANAGE_REFERRAL_CODES" },
    ],
  },
  {
    key: "compliance", label: "Compliance", icon: ShieldCheck, items: [
      { label: "KYC review", href: "/admin/kyc", icon: ShieldCheck, privilege: "MANAGE_AML" },
      { label: "FinCEN filings", href: "/admin/fincen", icon: FileText, privilege: "MANAGE_AML" },
      { label: "MTL licensing", href: "/admin/mtl", icon: MapPin, privilege: "MANAGE_AML" },
    ],
  },
  {
    key: "billing", label: "Billing", icon: CreditCard, items: [
      { label: "Overview", href: "/admin/billing", icon: LayoutGrid, privilege: "MANAGE_BILLING" },
      { label: "Subscriptions", href: "/admin/billing/subscriptions", icon: Repeat, privilege: "MANAGE_BILLING" },
      { label: "Promo codes", href: "/admin/billing/promo", icon: Tag, privilege: "MANAGE_BILLING" },
      { label: "Treasury", href: "/admin/billing/treasury", icon: Landmark, privilege: "MANAGE_BILLING" },
      { label: "Issuing", href: "/admin/billing/issuing", icon: CreditCard, privilege: "MANAGE_BILLING" },
      { label: "Offramp", href: "/admin/billing/offramp", icon: ArrowLeftRight, privilege: "MANAGE_BILLING" },
      { label: "Customers", href: "/admin/billing/customers", icon: Users, privilege: "MANAGE_BILLING" },
      { label: "Applications", href: "/admin/billing/applications", icon: ClipboardList, privilege: "MANAGE_BILLING" },
    ],
  },
  {
    key: "settings", label: "Settings", icon: Settings, items: [
      { label: "Users", href: "/admin/users", icon: Users, privilege: "MANAGE_USERS" },
      { label: "API keys", href: "/admin/api-keys", icon: KeyRound, privilege: "MANAGE_API_KEYS" },
      { label: "Audit log", href: "/admin/audit", icon: ScrollText, privilege: "VIEW_AUDIT" },
    ],
  },
]

/** Filter items by privilege and drop any group left with no items. Never mutates NAV_GROUPS. */
export function visibleNav(privileges: string[]): NavGroup[] {
  return NAV_GROUPS
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => !it.privilege || privileges.includes(it.privilege)),
    }))
    .filter((g) => g.items.length > 0)
}

/** Active-route matching. Exact match except the Articles list, which also stays
 *  active while editing an article (/admin/articles/[id]) but not on /new. */
export function isItemActive(href: string, pathname: string): boolean {
  if (href === "/admin") {
    return (
      pathname === "/admin" ||
      (pathname.startsWith("/admin/articles/") && pathname !== "/admin/articles/new")
    )
  }
  if (href === "/admin/articles/new") return pathname === "/admin/articles/new"
  return pathname === href
}

export function groupHasActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((it) => isItemActive(it.href, pathname))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:CI='true'; node_modules/.bin/vitest run tests/cms/admin-nav.test.ts`
Expected: PASS (all 9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cms/admin-nav.ts tests/cms/admin-nav.test.ts
git commit -m "feat(admin-nav): nav config + gating/active-route helpers"
```

---

### Task 2: AdminNav tree component (`components/cms/AdminNav.tsx`)

Client component rendering the tree from `visibleNav`. Group headers are `<button aria-expanded>` toggles; leaves are `<Link>`. The active group auto-expands; explicit toggles persist in localStorage and win over the auto default. Leaf clicks call `onNavigate` (drawer close); header toggles do not.

**Files:**
- Create: `components/cms/AdminNav.tsx`
- Test: `tests/cms/admin-nav-tree.test.tsx`

**Interfaces:**
- Consumes: `visibleNav`, `isItemActive`, `groupHasActive` from `@/lib/cms/admin-nav`; `usePathname` from `next/navigation`; `Link` from `next/link`.
- Produces: `function AdminNav(props: { privileges: string[]; onNavigate?: () => void }): JSX.Element`. localStorage key is `"subfrost.adminNav.open"` storing `Record<groupKey, boolean>` of explicit toggles.

- [ ] **Step 1: Write the failing test**

Create `tests/cms/admin-nav-tree.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent, cleanup } from "@testing-library/react"

const pathnameMock = vi.fn(() => "/admin/kyc")
vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock() }))

import { AdminNav } from "@/components/cms/AdminNav"

const ALL = [
  "MANAGE_FUEL", "MANAGE_REFERRAL_CODES", "MANAGE_AML",
  "MANAGE_BILLING", "MANAGE_USERS", "MANAGE_API_KEYS", "VIEW_AUDIT",
]

beforeEach(() => {
  cleanup()
  localStorage.clear()
  pathnameMock.mockReturnValue("/admin/kyc")
})

describe("AdminNav", () => {
  it("auto-expands the active group and marks the active leaf with aria-current", () => {
    const { getByText } = render(<AdminNav privileges={ALL} />)
    const kyc = getByText("KYC review")
    expect(kyc.closest("a")?.getAttribute("aria-current")).toBe("page")
  })

  it("keeps non-active groups collapsed (their leaves not rendered)", () => {
    const { queryByText } = render(<AdminNav privileges={ALL} />)
    expect(queryByText("Treasury")).toBeNull()
  })

  it("toggles a group open on header click and sets aria-expanded", () => {
    const { getByRole, queryByText } = render(<AdminNav privileges={ALL} />)
    const billing = getByRole("button", { name: /Billing/ })
    expect(billing.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(billing)
    expect(billing.getAttribute("aria-expanded")).toBe("true")
    expect(queryByText("Treasury")).not.toBeNull()
  })

  it("persists an explicit toggle and restores it on remount", () => {
    const first = render(<AdminNav privileges={ALL} />)
    fireEvent.click(first.getByRole("button", { name: /Billing/ }))
    expect(JSON.parse(localStorage.getItem("subfrost.adminNav.open")!).billing).toBe(true)
    cleanup()
    const second = render(<AdminNav privileges={ALL} />)
    expect(second.queryByText("Treasury")).not.toBeNull()
  })

  it("calls onNavigate on a leaf click but not on a group toggle", () => {
    const onNavigate = vi.fn()
    const { getByText, getByRole } = render(<AdminNav privileges={ALL} onNavigate={onNavigate} />)
    fireEvent.click(getByRole("button", { name: /Community/ }))
    expect(onNavigate).not.toHaveBeenCalled()
    fireEvent.click(getByText("FUEL"))
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:CI='true'; node_modules/.bin/vitest run tests/cms/admin-nav-tree.test.tsx`
Expected: FAIL — cannot resolve `@/components/cms/AdminNav`.

- [ ] **Step 3: Write minimal implementation**

Create `components/cms/AdminNav.tsx`:

```tsx
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
    <nav className="flex-1 space-y-1 text-sm">
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:CI='true'; node_modules/.bin/vitest run tests/cms/admin-nav-tree.test.tsx`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add components/cms/AdminNav.tsx tests/cms/admin-nav-tree.test.tsx
git commit -m "feat(admin-nav): expandable tree component with persistence"
```

---

### Task 3: UserMenu component (`components/cms/UserMenu.tsx`)

Footer account button (avatar initials + name/role) that opens a popover with My profile · View articles · Sign out. Closes on outside-click and Esc. Sign out submits the existing `logout` server action.

**Files:**
- Create: `components/cms/UserMenu.tsx`
- Test: `tests/cms/user-menu.test.tsx`

**Interfaces:**
- Consumes: `logout` from `@/actions/cms/auth` (existing server action, `() => Promise<void>`); `Link` from `next/link`.
- Produces: `function UserMenu(props: { name: string | null; email: string; role: string }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

Create `tests/cms/user-menu.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent, cleanup } from "@testing-library/react"

vi.mock("@/actions/cms/auth", () => ({ logout: vi.fn() }))

import { UserMenu } from "@/components/cms/UserMenu"

beforeEach(() => cleanup())

describe("UserMenu", () => {
  it("shows the user name, role and computed initials", () => {
    const { getByText } = render(<UserMenu name="Vitor Souza" email="v@s.io" role="ADMIN" />)
    expect(getByText("Vitor Souza")).toBeTruthy()
    expect(getByText("ADMIN")).toBeTruthy()
    expect(getByText("VS")).toBeTruthy()
  })

  it("falls back to email initials when name is null", () => {
    const { getByText } = render(<UserMenu name={null} email="rwp@subfrost.io" role="EDITOR" />)
    expect(getByText("RW")).toBeTruthy()
  })

  it("opens the popover with the three account items on click", () => {
    const { getByRole, queryByText, getByText } = render(
      <UserMenu name="Vitor" email="v@s.io" role="ADMIN" />,
    )
    expect(queryByText("My profile")).toBeNull()
    fireEvent.click(getByRole("button", { name: /Vitor/ }))
    expect(getByText("My profile")).toBeTruthy()
    expect(getByText("View articles")).toBeTruthy()
    expect(getByText("Sign out")).toBeTruthy()
  })

  it("renders Sign out as a submit button inside a form", () => {
    const { getByRole, getByText } = render(<UserMenu name="Vitor" email="v@s.io" role="ADMIN" />)
    fireEvent.click(getByRole("button", { name: /Vitor/ }))
    const signOut = getByText("Sign out").closest("button")
    expect(signOut?.getAttribute("type")).toBe("submit")
    expect(signOut?.closest("form")).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:CI='true'; node_modules/.bin/vitest run tests/cms/user-menu.test.tsx`
Expected: FAIL — cannot resolve `@/components/cms/UserMenu`.

- [ ] **Step 3: Write minimal implementation**

Create `components/cms/UserMenu.tsx`:

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:CI='true'; node_modules/.bin/vitest run tests/cms/user-menu.test.tsx`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/cms/UserMenu.tsx tests/cms/user-menu.test.tsx
git commit -m "feat(admin-nav): user-button popover menu"
```

---

### Task 4: Refactor AdminShell to compose AdminNav + UserMenu

Replace the inline flat `nav` and `footer` in `AdminShell` with `<AdminNav>` and `<UserMenu>`, in both the desktop sidebar and the mobile drawer. The blanket `onClick={() => setOpen(false)}` on the old `<nav>` is removed; the drawer instead passes `onNavigate={() => setOpen(false)}` into `AdminNav` so only leaf clicks close it (group toggles don't). Brand and the mobile top bar are unchanged.

**Files:**
- Modify: `components/cms/AdminShell.tsx` (full rewrite of the component body; keep the `ShellUser` export and the `"use client"` directive)
- Test: `tests/cms/admin-shell.test.tsx`

**Interfaces:**
- Consumes: `AdminNav` from `@/components/cms/AdminNav`; `UserMenu` from `@/components/cms/UserMenu`.
- Produces: unchanged public surface — `interface ShellUser { name: string | null; email: string; role: string; privileges: string[] }` and `function AdminShell(props: { user: ShellUser; children: React.ReactNode }): JSX.Element`. (`app/admin/layout.tsx` already imports both and must keep compiling untouched.)

- [ ] **Step 1: Write the failing test**

Create `tests/cms/admin-shell.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, cleanup } from "@testing-library/react"

vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }))
vi.mock("@/actions/cms/auth", () => ({ logout: vi.fn() }))

import { AdminShell } from "@/components/cms/AdminShell"

const user = { name: "Vitor", email: "v@s.io", role: "ADMIN", privileges: [] as string[] }

beforeEach(() => {
  cleanup()
  localStorage.clear()
})

describe("AdminShell", () => {
  it("renders the brand, the nav tree and its children", () => {
    const { getAllByText, getByText } = render(
      <AdminShell user={user}>
        <p>page body</p>
      </AdminShell>,
    )
    // brand appears in desktop sidebar + mobile top bar
    expect(getAllByText("SUBFROST").length).toBeGreaterThanOrEqual(1)
    expect(getByText("All articles")).toBeTruthy() // AdminNav rendered (Articles group always visible)
    expect(getByText("page body")).toBeTruthy()
  })

  it("renders the user button (name + role) via UserMenu", () => {
    const { getAllByText } = render(
      <AdminShell user={user}>
        <span>x</span>
      </AdminShell>,
    )
    expect(getAllByText("Vitor").length).toBeGreaterThanOrEqual(1)
    expect(getAllByText("ADMIN").length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:CI='true'; node_modules/.bin/vitest run tests/cms/admin-shell.test.tsx`
Expected: FAIL — assertions fail (current `AdminShell` renders the old flat nav with "Articles"/"My profile", not "All articles", and has no `UserMenu`). It may also fail because the old AdminShell does not import `usePathname` (still renders, so the failure is the assertion on "All articles").

- [ ] **Step 3: Write minimal implementation**

Replace the entire contents of `components/cms/AdminShell.tsx` with:

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:CI='true'; node_modules/.bin/vitest run tests/cms/admin-shell.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Full verification (tests + types + build)**

Run each and confirm clean:
- `$env:CI='true'; node_modules/.bin/vitest run` → all green (existing 461 + the new specs; 0 failures).
- `node_modules/.bin/tsc --noEmit` → 0 errors.
- `node_modules/.bin/next build` → completes with 0 errors.

If `next build` flags an unused import in `AdminShell.tsx` (the old `FileText`/`Users`/etc. imports are gone in the rewrite — confirm none remain), remove it and re-run.

- [ ] **Step 6: Commit**

```bash
git add components/cms/AdminShell.tsx tests/cms/admin-shell.test.tsx
git commit -m "feat(admin-nav): compose tree + user menu into AdminShell"
```

---

## Post-implementation (out of the per-task loop)

- Open the PR: `feat/admin-nav-tree` → `main` (branch → PR → merge per repo policy; do not push to `main`). PR body should note: 100% frontend, no schema/migrate, screenshots of the tree (desktop + mobile drawer) and the user popover.
- After merge, ship via Flux: wait for the regional image build, then bump `newTag` in `k8s/kustomization.yaml` (its own PR), and optionally force reconcile.
- Live check: `curl -I https://subfrost.io/admin` → 307; logged in, the active group is expanded, toggles persist across reload, and the user popover works on desktop + mobile.
