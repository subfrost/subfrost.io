import { notFound, redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { AdminEditor } from "@/components/cms/AdminEditor"

export const dynamic = "force-dynamic"

const empty = { title: "", excerpt: "", body: "" }

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

  const tr = (loc: "en" | "zh") => {
    const t = article.translations.find((x) => x.locale === loc)
    return t ? { title: t.title, excerpt: t.excerpt, body: t.body } : empty
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Edit article</h1>
      <AdminEditor
        canPublish={canPublish}
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
