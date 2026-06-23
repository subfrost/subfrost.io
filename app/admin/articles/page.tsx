import Link from "next/link"
import { redirect } from "next/navigation"
import { format } from "date-fns"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { Button } from "@/components/ui/button"

export const dynamic = "force-dynamic"

const statusColor: Record<string, string> = {
  DRAFT: "text-zinc-400 border-zinc-700",
  REVIEW: "text-amber-300 border-amber-700/60",
  PUBLISHED: "text-emerald-300 border-emerald-700/60",
  ARCHIVED: "text-zinc-500 border-zinc-800",
}

export default async function ArticlesList() {
  const user = await currentUser()
  if (!user) redirect("/admin/login")
  // Any signed-in user sees their own articles; editors/admins see all.
  const canSeeAll = user.privileges.includes("articles.edit_any")

  const articles = await prisma.article.findMany({
    where: canSeeAll ? {} : { authorId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      author: { select: { name: true, email: true } },
      translations: { select: { locale: true, title: true } },
    },
    take: 100,
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Articles</h1>
          <p className="text-sm text-zinc-500">{canSeeAll ? "All articles" : "Your articles"}</p>
        </div>
        <Link href="/admin/articles/new"><Button>New article</Button></Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Langs</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Author</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {articles.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-500">No articles yet.</td></tr>
            )}
            {articles.map((a) => {
              const primary = a.translations.find((t) => t.locale === a.primaryLocale) ?? a.translations[0]
              return (
                <tr key={a.id} className="border-t border-zinc-800 hover:bg-zinc-900/40">
                  <td className="px-4 py-3">
                    <Link href={`/admin/articles/${a.id}`} className="font-medium text-white hover:underline">
                      {primary?.title ?? a.slug}
                    </Link>
                    {a.featured && <span className="ml-2 rounded-full border border-sky-700/60 px-2 py-0.5 text-xs text-sky-300">Featured</span>}
                    <Link href={`/admin/articles/${a.id}/preview`} target="_blank" className="ml-2 text-xs text-zinc-500 hover:text-sky-300">Preview ↗</Link>
                  </td>
                  <td className="px-4 py-3 uppercase text-zinc-400">{a.translations.map((t) => t.locale).join(" / ") || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${statusColor[a.status] ?? ""}`}>{a.status}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{a.author.name ?? a.author.email}</td>
                  <td className="px-4 py-3 text-zinc-500">{format(a.updatedAt, "MMM d, HH:mm")}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
