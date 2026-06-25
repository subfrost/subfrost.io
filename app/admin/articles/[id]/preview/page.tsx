import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { readingTime } from "@/lib/cms/slug"
import { ArticleView } from "@/components/cms/ArticleView"
import { PreviewActions } from "@/components/cms/PreviewActions"
import { EditorialThemeScope } from "@/components/articles/EditorialThemeScope"

export const dynamic = "force-dynamic"

// Admin-only full-page preview: renders the draft exactly as it will appear once
// published (same <ArticleView> as /articles/[slug]), with an EN/中文 switcher and
// the one-button publish. Gated to the author or anyone with articles.publish —
// "sharing" the preview means sending this /admin URL to a permitted reviewer.
export default async function PreviewArticlePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { id } = await params
  const { lang } = await searchParams
  const user = await currentUser()
  if (!user) redirect("/admin/login")

  const article = await prisma.article.findUnique({ where: { id }, include: { tags: true, translations: true, author: true } })
  if (!article) notFound()
  const canPublish = user.privileges.includes("articles.publish")
  if (!canPublish && article.authorId !== user.id) redirect("/admin/articles")

  const available = article.translations.map((t) => t.locale as "en" | "zh")
  const locale: "en" | "zh" =
    lang === "zh" && available.includes("zh") ? "zh"
    : lang === "en" && available.includes("en") ? "en"
    : (article.primaryLocale as "en" | "zh")
  const tr = article.translations.find((t) => t.locale === locale) ?? article.translations[0]
  if (!tr) notFound()

  return (
    <div className="-m-5 flex min-h-full flex-col md:-m-8">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href={`/admin/articles/${id}`} className="text-zinc-400 hover:text-white">← Edit</Link>
          <span className="rounded-full border border-amber-700/60 px-2 py-0.5 text-xs text-amber-300">Preview · {article.status}</span>
          <div className="flex gap-1">
            {available.map((loc) => (
              <Link key={loc} href={`/admin/articles/${id}/preview?lang=${loc}`}
                className={`rounded px-2 py-0.5 text-xs ${loc === locale ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"}`}>
                {loc === "en" ? "English" : "中文"}
              </Link>
            ))}
          </div>
        </div>
        <PreviewActions id={id} slug={article.slug} canPublish={canPublish} />
      </div>
      <EditorialThemeScope className="flex-1" followSystemTheme>
        <ArticleView
          article={{
            title: tr.title,
            excerpt: tr.excerpt,
            body: tr.body,
            sources: tr.sources,
            publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null,
            tags: article.tags,
            author: {
              id: article.author.id,
              name: article.author.name ?? article.author.email,
              avatarUrl: article.author.avatarUrl,
              bio: article.author.bio,
              twitter: article.author.twitter,
            },
            readingMinutes: readingTime(tr.body),
          }}
          locale={locale}
        />
      </EditorialThemeScope>
    </div>
  )
}
