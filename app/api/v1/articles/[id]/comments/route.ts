import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { requireScope, ok, fail, guard, readJson } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Locale = "en" | "zh"
function parseLocale(v: string | null): Locale {
  return v === "zh" ? "zh" : "en"
}

// The preview gate mirrored for bearer keys: article author OR articles.publish.
async function canReview(actorId: string, privileges: string[], articleId: string): Promise<boolean | null> {
  const article = await prisma.article.findUnique({ where: { id: articleId }, select: { authorId: true } })
  if (!article) return null
  return privileges.includes("articles.publish") || article.authorId === actorId
}

// GET /api/v1/articles/:id/comments?locale=en[&versionId=] — list review comments.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, null)
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    const url = new URL(req.url)
    const locale = parseLocale(url.searchParams.get("locale"))
    const versionId = url.searchParams.get("versionId") ?? undefined
    const comments = await prisma.articleComment.findMany({
      where: { articleId: id, locale, ...(versionId ? { versionId } : {}) },
      orderBy: { createdAt: "asc" },
    })
    return ok({ count: comments.length, comments })
  })
}

// POST /api/v1/articles/:id/comments — add a review comment.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, null)
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    const allowed = await canReview(actor.id, actor.privileges, id)
    if (allowed === null) return fail("Article not found", 404)
    if (!allowed) return fail("Not allowed", 403)

    const body = await readJson<{ locale?: string; versionId?: string; anchor?: unknown; body?: string; parentId?: string }>(req)
    if (body instanceof NextResponse) return body
    if (!body.body?.trim()) return fail("Comment cannot be empty", 400)
    if (!body.anchor) return fail("anchor is required", 400)

    const created = await prisma.articleComment.create({
      data: {
        articleId: id,
        versionId: body.versionId ?? null,
        locale: parseLocale(body.locale ?? null),
        authorId: actor.id,
        anchor: body.anchor as Prisma.InputJsonValue,
        body: body.body.trim(),
        parentId: body.parentId ?? null,
      },
    })
    revalidatePath(`/admin/articles/${id}/preview`)
    return ok({ comment: created }, 201)
  })
}
