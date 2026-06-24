import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { AdminEditor } from "@/components/cms/AdminEditor"
import { translationUnavailable } from "@/lib/cms/translate"

export const dynamic = "force-dynamic"

const empty = { title: "", excerpt: "", body: "", sources: "" }

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await currentUser()
  if (!user) redirect("/admin/login")

  const article = await prisma.article.findUnique({
    where: { id },
    include: { tags: true, translations: true },
  })
  if (!article) notFound()

  const canPublish = user.privileges.includes("articles.publish")
  if (!canPublish && article.authorId !== user.id) redirect("/admin/articles")
  const canTranslate = !translationUnavailable()

  const tr = (loc: "en" | "zh") => {
    const t = article.translations.find((x) => x.locale === loc)
    return t ? { title: t.title, excerpt: t.excerpt, body: t.body, sources: t.sources } : empty
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Edit article</h1>
        <Link href={`/admin/articles/${article.id}/preview`} target="_blank"
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:border-sky-700 hover:text-white">
          Preview ↗
        </Link>
      </div>
      <AdminEditor
        canPublish={canPublish}
        canTranslate={canTranslate}
        initial={{
          id: article.id,
          slug: article.slug,
          coverImage: article.coverImage ?? "",
          tags: article.tags.map((t) => t.name),
          featured: article.featured,
          primaryLocale: article.primaryLocale as "en" | "zh",
          status: article.status,
          en: tr("en"),
          zh: tr("zh"),
        }}
      />
    </div>
  )
}
