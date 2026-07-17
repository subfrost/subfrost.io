import Link from "next/link"
import { redirect } from "next/navigation"
import { format } from "date-fns"
import { ArrowRight, Plus } from "lucide-react"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"

export const dynamic = "force-dynamic"

const statusColor: Record<string, string> = {
  DRAFT: "text-[color:var(--ed-muted)]",
  REVIEW: "text-[#b36b00]",
  PUBLISHED: "text-[#0f7a4a]",
  ARCHIVED: "text-[color:var(--ed-muted)]",
}

const statusLabel: Record<string, string> = {
  DRAFT: "Draft",
  REVIEW: "Review",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
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
      tags: { select: { name: true } },
      translations: { select: { locale: true, title: true, excerpt: true } },
    },
    take: 100,
  })

  return (
    <div className="mx-auto max-w-[1280px]">
      <div className="mb-10 flex items-end justify-between gap-6">
        <div>
          <p className="mb-3 text-[15px] font-medium text-[color:var(--ed-muted)]">CMS</p>
          <h1 className="text-[56px] font-normal leading-[0.98] text-[color:var(--ed-ink)] sm:text-[76px]">Articles</h1>
          <p className="mt-5 text-[18px] text-[color:var(--ed-body)]">{canSeeAll ? "All articles" : "Your articles"}</p>
        </div>
        <Link
          href="/admin/articles/new"
          className="inline-flex h-11 items-center gap-2 rounded-[6px] bg-[color:var(--ed-action-bg)] px-5 text-sm font-medium text-[color:var(--ed-action-fg)] transition-opacity hover:opacity-90"
        >
          New article
          <Plus size={14} />
        </Link>
      </div>

      <div className="border-t border-[color:var(--ed-hair)]">
        {articles.length === 0 && (
          <div className="py-14 text-center text-[color:var(--ed-muted)]">No articles yet.</div>
        )}
        {articles.map((a) => {
          const primary = a.translations.find((t) => t.locale === a.primaryLocale) ?? a.translations[0]
          const title = primary?.title ?? a.slug
          const languageLabel = a.translations.map((t) => t.locale.toUpperCase()).join(" / ") || "—"
          const author = a.author.name ?? a.author.email
          return (
            <Link
              key={a.id}
              href={`/admin/articles/${a.id}`}
              className="group grid gap-6 border-b border-[color:var(--ed-hair)] py-7 transition-colors hover:bg-[color:var(--ed-surface)] md:grid-cols-[minmax(0,1fr)_minmax(260px,300px)_32px] md:items-center md:gap-10 md:py-8 lg:gap-14"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--ed-muted)]">
                  {a.tags.slice(0, 2).map((tag) => <span key={tag.name}>{tag.name}</span>)}
                  {a.featured && <span>Featured</span>}
                  <span className={statusColor[a.status] ?? ""}>{statusLabel[a.status] ?? a.status}</span>
                </div>
                <h2 className="mt-2 max-w-3xl text-[18px] font-medium leading-[1.25] text-[color:var(--ed-ink)] transition-colors duration-200 group-hover:text-[color:var(--ed-accent)] sm:text-[22px]">
                  {title}
                </h2>
                <p className="mt-2 line-clamp-2 max-w-[720px] text-sm leading-[1.5] text-[color:var(--ed-body)]">
                  {primary?.excerpt || "No excerpt yet."}
                </p>
              </div>

              <div className="grid gap-3 text-sm md:gap-2.5 md:px-2">
                <div className="grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-4">
                  <div className="text-xs text-[color:var(--ed-muted)]">Language</div>
                  <div className="truncate text-[color:var(--ed-ink)]">{languageLabel}</div>
                </div>
                <div className="grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-4">
                  <div className="text-xs text-[color:var(--ed-muted)]">Author</div>
                  <div className="truncate text-[color:var(--ed-ink)]">{author}</div>
                </div>
                <div className="grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-4">
                  <div className="text-xs text-[color:var(--ed-muted)]">Updated</div>
                  <time className="block truncate text-[color:var(--ed-ink)]" dateTime={a.updatedAt.toISOString()}>
                    {format(a.updatedAt, "MMM d, HH:mm")}
                  </time>
                </div>
              </div>

              <div className="flex items-center justify-end text-[color:var(--ed-muted)] transition-[color,transform] duration-200 group-hover:translate-x-1 group-hover:text-[color:var(--ed-ink)]">
                <ArrowRight className="h-5 w-5" strokeWidth={2} />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
