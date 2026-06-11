import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { currentUser, hasRole } from "@/lib/authz"
import { ArticleEditor } from "@/components/ArticleEditor"

export const dynamic = "force-dynamic"

export default async function EditArticlePage({
  params,
}: {
  params: { id: string }
}) {
  const user = await currentUser()
  if (!user) redirect("/admin/login")

  const article = await prisma.article.findUnique({
    where: { id: params.id },
    include: { tags: true },
  })
  if (!article) notFound()

  const canPublish = hasRole(user.role, "EDITOR")
  // Authors may only edit their own articles.
  if (!canPublish && article.authorId !== user.id) redirect("/admin")

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Edit article</h1>
      <ArticleEditor
        canPublish={canPublish}
        initial={{
          id: article.id,
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
          body: article.body,
          coverImage: article.coverImage ?? "",
          tags: article.tags.map((t) => t.name),
          featured: article.featured,
          status: article.status,
        }}
      />
    </div>
  )
}
