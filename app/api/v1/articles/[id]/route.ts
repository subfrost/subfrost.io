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

// GET /api/v1/articles/:id — the FULL article (all locale translations incl.
// excerpt/sources, tags, co-authors), shaped as the ArticleInput the upsert
// route consumes. This is the read half of a safe edit round-trip: `articles
// get` → tweak → `articles upload` (with the returned `id`) updates in place
// without clobbering excerpt/sources/tags/other-locales. Any valid key (like
// the list/versions siblings).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, null)
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    const a = await prisma.article.findUnique({
      where: { id },
      include: {
        translations: true,
        tags: { select: { name: true } },
        coAuthors: { select: { id: true, email: true } },
        author: { select: { id: true, email: true, name: true } },
      },
    })
    if (!a) return fail("Article not found", 404)
    const translations: Record<string, { title: string; excerpt: string; body: string; sources: string }> = {}
    for (const t of a.translations) {
      translations[t.locale] = { title: t.title, excerpt: t.excerpt, body: t.body, sources: t.sources }
    }
    return ok({
      id: a.id,
      slug: a.slug,
      status: a.status,
      featured: a.featured,
      primaryLocale: a.primaryLocale,
      coverImage: a.coverImage ?? "",
      tags: a.tags.map((t) => t.name),
      coAuthorIds: a.coAuthors.map((c) => c.id),
      author: a.author,
      publishedAt: a.publishedAt,
      updatedAt: a.updatedAt,
      translations,
    })
  })
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
