"use server"

import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { upsertArticle, type ArticleInput, type WriteResult } from "@/lib/cms/article-write"

export type ActionResult = WriteResult

export async function saveArticle(input: ArticleInput): Promise<ActionResult> {
  const user = await currentUser()
  if (!user) return { ok: false, error: "Not authenticated" }
  const res = await upsertArticle({ id: user.id, privileges: user.privileges }, input)
  if (res.ok) revalidateArticle(res.slug)
  return res
}

export async function deleteArticle(id: string): Promise<ActionResult> {
  const user = await currentUser()
  if (!user) return { ok: false, error: "Not authenticated" }
  const existing = await prisma.article.findUnique({ where: { id } })
  if (!existing) return { ok: false, error: "Article not found" }
  if (!user.privileges.includes("EDIT_ANY_ARTICLE") && existing.authorId !== user.id) {
    return { ok: false, error: "Not allowed" }
  }
  await prisma.article.delete({ where: { id } })
  revalidateArticle(existing.slug)
  return { ok: true, slug: existing.slug, id }
}

function revalidateArticle(slug: string) {
  revalidatePath("/")
  revalidatePath("/articles")
  revalidatePath(`/articles/${slug}`)
}
