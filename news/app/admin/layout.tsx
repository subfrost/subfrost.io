import Link from "next/link"
import { currentUser } from "@/lib/authz"
import { doSignOut } from "@/actions/auth"
import { FileText, Users, PlusCircle, LogOut } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await currentUser()

  // Middleware (see middleware.ts) gates /admin/* and lets /admin/login through
  // unauthenticated — so the only way to reach here without a user is the login
  // page, which brings its own full-screen layout. Render it bare.
  if (!user) return <>{children}</>

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r border-zinc-800 bg-card/40 p-4">
        <div className="mb-6 px-2">
          <div className="text-lg font-bold responsive-shadow">SUBFROST</div>
          <div className="text-xs uppercase tracking-widest text-zinc-500">News Admin</div>
        </div>

        <nav className="flex-1 space-y-1 text-sm">
          <NavItem href="/admin" icon={<FileText size={16} />}>
            Articles
          </NavItem>
          <NavItem href="/admin/articles/new" icon={<PlusCircle size={16} />}>
            New article
          </NavItem>
          {user.role === "ADMIN" && (
            <NavItem href="/admin/users" icon={<Users size={16} />}>
              Users
            </NavItem>
          )}
        </nav>

        <div className="mt-4 border-t border-zinc-800 pt-4">
          <div className="px-2 text-sm text-zinc-300">{user.name ?? user.email}</div>
          <div className="px-2 text-xs uppercase tracking-wide text-zinc-500">{user.role}</div>
          <form action={doSignOut} className="mt-3">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <LogOut size={16} /> Sign out
            </button>
          </form>
          <a
            href="https://news.subfrost.io"
            className="mt-1 block px-2 text-xs text-zinc-600 hover:text-zinc-400"
          >
            View site ↗
          </a>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  )
}

function NavItem({
  href,
  icon,
  children,
}: {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-2 py-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
    >
      {icon}
      {children}
    </Link>
  )
}
