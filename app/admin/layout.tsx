import { currentUser } from "@/lib/cms/authz"
import { AdminShell } from "@/components/cms/AdminShell"

export const dynamic = "force-dynamic"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()
  // Middleware gates /admin/* (login exempt); reaching here without a user means
  // the login page, which renders bare on a dark background.
  if (!user) return <div className="min-h-screen bg-zinc-950">{children}</div>

  return (
    <AdminShell
      user={{ name: user.name, email: user.email, role: user.role, privileges: user.privileges }}
    >
      {children}
    </AdminShell>
  )
}
