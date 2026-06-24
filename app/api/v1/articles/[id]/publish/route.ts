import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { upsertArticle } from "@/lib/cms/article-write"
import { requireScope, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function revalidateArticle(slug: string) {
  revalidatePath("/")
  revalidatePath("/articles")
  revalidatePath(`/articles/${slug}`)
}

// POST /api/v1/articles/:id/publish — flip an article to PUBLISHED, keeping its
// existing slug/fields. Mirrors publishArticleAction: gated on articles.edit_any
// or article ownership. upsertArticle downgrades PUBLISHED→REVIEW server-side
// when the actor lacks articles.publish, so "submit for review" is handled there.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, null)
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    const article = await prisma.article.findUnique({ where: { id }, include: { tags: true } })
    if (!article) return fail("Article not found", 404)
    if (!actor.privileges.includes("articles.edit_any") && article.authorId !== actor.id) {
      return fail("Not allowed", 403)
    }
    const translations = await prisma.articleTranslation.findMany({ where: { articleId: id } })
    const res = await upsertArticle(
      { id: actor.id, privileges: actor.privileges },
      {
        id,
        slug: article.slug,
        coverImage: article.coverImage ?? "",
        tags: article.tags.map((t) => t.name),
        featured: article.featured,
        primaryLocale: article.primaryLocale as "en" | "zh",
        status: "PUBLISHED",
        translations: {
          en: translations.find((t) => t.locale === "en") ?? undefined,
          zh: translations.find((t) => t.locale === "zh") ?? undefined,
        },
      },
    )
    if (!res.ok) return fail(res.error, 400)
    revalidateArticle(res.slug)
    return ok(res)
  })
}
