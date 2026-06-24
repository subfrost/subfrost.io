import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { requireScope, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function revalidateArticle(slug: string) {
  revalidatePath("/")
  revalidatePath("/articles")
  revalidatePath(`/articles/${slug}`)
}

// DELETE /api/v1/articles/:id — delete an article. Mirrors deleteArticle's gate:
// requires articles.edit_any, or being the article's author.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, null)
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    const existing = await prisma.article.findUnique({ where: { id } })
    if (!existing) return fail("Article not found", 404)
    if (!actor.privileges.includes("articles.edit_any") && existing.authorId !== actor.id) {
      return fail("Not allowed", 403)
    }
    await prisma.article.delete({ where: { id } })
    revalidateArticle(existing.slug)
    return ok({ ok: true, slug: existing.slug, id })
  })
}
