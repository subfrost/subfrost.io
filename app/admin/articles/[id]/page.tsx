import { notFound, redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { AdminEditor } from "@/components/cms/AdminEditor"
import { translationUnavailable } from "@/lib/cms/translate"
import { getCoAuthorOptions } from "@/lib/cms/articles"

export const dynamic = "force-dynamic"

const empty = { title: "", excerpt: "", body: "", sources: "" }

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await currentUser()
  if (!user) redirect("/admin/login")

  const article = await prisma.article.findUnique({
    where: { id },
    include: { tags: true, translations: true, coAuthors: { select: { id: true } } },
  })
  if (!article) notFound()

  const canPublish = user.privileges.includes("articles.publish")
  if (!canPublish && article.authorId !== user.id) redirect("/admin/articles")
  const canTranslate = !translationUnavailable()
  const members = await getCoAuthorOptions(article.authorId)

  const tr = (loc: "en" | "zh") => {
    const t = article.translations.find((x) => x.locale === loc)
    return t ? { title: t.title, excerpt: t.excerpt, body: t.body, sources: t.sources } : empty
  }

  return (
    <AdminEditor
      canPublish={canPublish}
      canTranslate={canTranslate}
      members={members}
      initial={{
        id: article.id,
        slug: article.slug,
        coverImage: article.coverImage ?? "",
        tags: article.tags.map((t) => t.name),
        featured: article.featured,
        primaryLocale: article.primaryLocale as "en" | "zh",
        status: article.status,
        coAuthorIds: article.coAuthors.map((c) => c.id),
        en: tr("en"),
        zh: tr("zh"),
      }}
    />
  )
}
