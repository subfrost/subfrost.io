import Link from "next/link"
import { currentUser } from "@/lib/cms/authz"
import { logout } from "@/actions/cms/auth"
import { FileText, Users, PlusCircle, LogOut, KeyRound, UserCircle, ScrollText } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()
  // Middleware gates /admin/* (login exempt); reaching here without a user means
  // the login page, which renders bare on a dark background.
  if (!user) return <div className="min-h-screen bg-zinc-950">{children}</div>

  const can = (p: (typeof user.privileges)[number]) => user.privileges.includes(p)

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="flex w-60 flex-col border-r border-zinc-800 bg-zinc-900/40 p-4">
        <div className="mb-6 px-2">
          <div className="text-lg font-bold text-white">SUBFROST</div>
          <div className="text-xs uppercase tracking-widest text-zinc-500">Editorial</div>
        </div>
        <nav className="flex-1 space-y-1 text-sm">
          <NavItem href="/admin" icon={<FileText size={16} />}>Articles</NavItem>
          <NavItem href="/admin/articles/new" icon={<PlusCircle size={16} />}>New article</NavItem>
          <NavItem href="/admin/profile" icon={<UserCircle size={16} />}>My profile</NavItem>
          {can("MANAGE_API_KEYS") && <NavItem href="/admin/api-keys" icon={<KeyRound size={16} />}>API keys</NavItem>}
          {can("MANAGE_USERS") && <NavItem href="/admin/users" icon={<Users size={16} />}>Users</NavItem>}
          {can("VIEW_AUDIT") && <NavItem href="/admin/audit" icon={<ScrollText size={16} />}>Audit log</NavItem>}
        </nav>
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
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
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
