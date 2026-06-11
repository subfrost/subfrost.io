import Link from "next/link"
import { format } from "date-fns"
import { prisma } from "@/lib/prisma"
import { currentUser, hasRole } from "@/lib/authz"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

const statusColor: Record<string, string> = {
  DRAFT: "text-zinc-400 border-zinc-700",
  REVIEW: "text-amber-300 border-amber-700/60",
  PUBLISHED: "text-emerald-300 border-emerald-700/60",
  ARCHIVED: "text-zinc-500 border-zinc-800",
}

export default async function AdminDashboard() {
  const user = await currentUser()
  const canSeeAll = user ? hasRole(user.role, "EDITOR") : false

  const articles = await prisma.article.findMany({
    where: canSeeAll ? {} : { authorId: user!.id },
    orderBy: { updatedAt: "desc" },
    include: { author: { select: { name: true, email: true } }, tags: true },
    take: 100,
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Articles</h1>
          <p className="text-sm text-zinc-500">
            {canSeeAll ? "All articles" : "Your articles"}
          </p>
        </div>
        <Link href="/admin/articles/new">
          <Button>New article</Button>
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Author</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {articles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-zinc-500">
                  No articles yet. Create your first one.
                </td>
              </tr>
            )}
            {articles.map((a) => (
              <tr key={a.id} className="border-t border-zinc-800 hover:bg-zinc-900/40">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/articles/${a.id}`}
                    className="font-medium text-white hover:underline"
                  >
                    {a.title}
                  </Link>
                  {a.featured && (
                    <Badge className="ml-2 border-brand-blue/60 text-brand-ice">Featured</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      statusColor[a.status] ?? ""
                    }`}
                  >
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {a.author.name ?? a.author.email}
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {format(a.updatedAt, "MMM d, HH:mm")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
