import { notFound, redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { AdminEditor } from "@/components/cms/AdminEditor"
import { translationUnavailable } from "@/lib/cms/translate"

export const dynamic = "force-dynamic"

const empty = { title: "", excerpt: "", body: "" }

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await currentUser()
  if (!user) redirect("/admin/login")

  const article = await prisma.article.findUnique({
    where: { id },
    include: {
      author: { select: { name: true, email: true } },
      tags: true,
      translations: true,
      revisions: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { editor: { select: { name: true, email: true } } },
      },
      coAuthors: { select: { id: true, name: true, email: true } },
    },
  })
  if (!article) notFound()

  const canPublish = user.privileges.includes("articles.publish")
  if (!canPublish && article.authorId !== user.id) redirect("/admin/articles")
  const members = await prisma.user.findMany({
    where: { active: true, id: { not: user.id } },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true },
  })

  const tr = (loc: "en" | "zh") => {
    const t = article.translations.find((x) => x.locale === loc)
    return t ? { title: t.title, excerpt: t.excerpt, body: t.body } : empty
  }

  return (
    <AdminEditor
      canPublish={canPublish}
      translationEnabled={!translationUnavailable()}
      initial={{
        id: article.id,
        slug: article.slug,
        coverImage: article.coverImage ?? "",
        tags: article.tags.map((t) => t.name),
        featured: article.featured,
        primaryLocale: article.primaryLocale as "en" | "zh",
        status: article.status,
        author: article.author,
        publishedAt: article.publishedAt?.toISOString() ?? null,
        updatedAt: article.updatedAt.toISOString(),
        coAuthorIds: article.coAuthors.map((member) => member.id),
        revisions: article.revisions.map((revision) => ({
          id: revision.id,
          locale: revision.locale as "en" | "zh",
          title: revision.title,
          createdAt: revision.createdAt.toISOString(),
          editorName: revision.editor?.name ?? null,
          editorEmail: revision.editor?.email ?? null,
        })),
        en: tr("en"),
        zh: tr("zh"),
      }}
      members={members.map((member) => ({ id: member.id, name: member.name ?? member.email }))}
    />
  )
}
