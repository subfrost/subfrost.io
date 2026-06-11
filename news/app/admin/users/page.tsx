import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { currentUser } from "@/lib/authz"
import { UsersManager, type UserRow } from "@/components/UsersManager"

export const dynamic = "force-dynamic"

export default async function UsersPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (me.role !== "ADMIN") redirect("/admin")

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { articles: true } } },
  })

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    active: u.active,
    articleCount: u._count.articles,
  }))

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Users &amp; roles</h1>
      <UsersManager users={rows} meId={me.id} />
    </div>
  )
}
