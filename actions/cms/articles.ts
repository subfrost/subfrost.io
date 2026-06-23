"use server"

import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { upsertArticle, type ArticleInput, type WriteResult } from "@/lib/cms/article-write"
import { translate, translationUnavailable, type Locale, type TranslationContent } from "@/lib/cms/translate"

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
  if (!user.privileges.includes("articles.edit_any") && existing.authorId !== user.id) {
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

export type TranslateResult =
  | { ok: true; translation: TranslationContent }
  | { ok: false; error: string; unavailable?: boolean }

// Explicit, human-triggered translation step: translate the `from` locale into
// `to` via Claude and persist the result statically (ArticleTranslation +
// Revision). Gated articles.write (+ author-or-edit_any). Graceful no-op when
// the Claude service isn't configured.
export async function translateArticleAction(articleId: string, from: Locale, to: Locale): Promise<TranslateResult> {
  const user = await currentUser()
  if (!user) return { ok: false, error: "Not authenticated" }
  if (!user.privileges.includes("articles.write")) return { ok: false, error: "Not allowed" }

  const article = await prisma.article.findUnique({ where: { id: articleId } })
  if (!article) return { ok: false, error: "Article not found" }
  if (!user.privileges.includes("articles.edit_any") && article.authorId !== user.id) {
    return { ok: false, error: "You can only edit your own articles" }
  }

  if (translationUnavailable()) return { ok: false, error: "Translation service not configured", unavailable: true }

  const sourceRow = await prisma.articleTranslation.findUnique({
    where: { articleId_locale: { articleId, locale: from } },
  })
  if (!sourceRow || !sourceRow.title.trim()) return { ok: false, error: `Nothing to translate in ${from}` }

  let out: TranslationContent
  try {
    out = await translate({ title: sourceRow.title, excerpt: sourceRow.excerpt, body: sourceRow.body }, from, to)
  } catch {
    return { ok: false, error: "Translation failed" }
  }

  await prisma.articleTranslation.upsert({
    where: { articleId_locale: { articleId, locale: to } },
    update: { title: out.title, excerpt: out.excerpt, body: out.body },
    create: { articleId, locale: to, title: out.title, excerpt: out.excerpt, body: out.body },
  })
  await prisma.revision.create({ data: { articleId, locale: to, title: out.title, body: out.body, editorId: user.id } })
  return { ok: true, translation: out }
}
