import { z } from "zod"
import prisma from "@/lib/prisma"
import type { Privilege } from "@/lib/cms/privileges"
import { toSlug } from "@/lib/cms/slug"
import { notifyNewArticle } from "@/lib/cms/article-notify"

const translationSchema = z.object({
  title: z.string().max(200).optional().default(""),
  excerpt: z.string().max(400).optional().default(""),
  body: z.string().optional().default(""),
  sources: z.string().optional().default(""),
})

export const articleInputSchema = z.object({
  id: z.string().optional(),
  slug: z.string().optional(),
  coverImage: z.string().url().optional().or(z.literal("")).transform((v) => v || null),
  tags: z.array(z.string()).optional().default([]),
  featured: z.boolean().optional().default(false),
  primaryLocale: z.enum(["en", "zh"]).default("en"),
  status: z.enum(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  translations: z.object({ en: translationSchema.optional(), zh: translationSchema.optional() }),
})

export type ArticleInput = z.input<typeof articleInputSchema>
export type WriteResult = { ok: true; slug: string; id: string } | { ok: false; error: string }

export interface Actor {
  id: string
  /** Effective privileges (a session user's, or a key's capped scopes). */
  privileges: Privilege[]
}

async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  let slug = base
  let n = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.article.findUnique({ where: { slug } })
    if (!existing || existing.id === ignoreId) return slug
    n += 1
    slug = `${base}-${n}`
  }
}

function collect(t: z.infer<typeof articleInputSchema>["translations"]) {
  const out: { locale: "en" | "zh"; title: string; excerpt: string; body: string; sources: string }[] = []
  for (const loc of ["en", "zh"] as const) {
    const tr = t[loc]
    if (tr && tr.title.trim()) out.push({ locale: loc, title: tr.title, excerpt: tr.excerpt, body: tr.body, sources: tr.sources })
  }
  return out
}

/** Create or update an article on behalf of `actor`. Shared by the /admin editor
 *  action and the bearer-key upload API. */
export async function upsertArticle(actor: Actor, input: ArticleInput): Promise<WriteResult> {
  const parsed = articleInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const data = parsed.data

  const translations = collect(data.translations)
  if (translations.length === 0) return { ok: false, error: "Add a title for at least one language" }

  let status = data.status
  if (status === "PUBLISHED" && !actor.privileges.includes("articles.publish")) status = "REVIEW"

  const primaryLocale = translations.some((t) => t.locale === data.primaryLocale)
    ? data.primaryLocale
    : translations[0].locale

  const tagConnect = data.tags
    .map((t) => ({ slug: toSlug(t), name: t.trim() }))
    .filter((t) => t.name)
    .map((t) => ({ where: { slug: t.slug }, create: { slug: t.slug, name: t.name } }))

  const slugSeed = translations.find((t) => t.locale === primaryLocale)!.title

  if (data.id) {
    const existing = await prisma.article.findUnique({ where: { id: data.id } })
    if (!existing) return { ok: false, error: "Article not found" }
    if (!actor.privileges.includes("articles.edit_any") && existing.authorId !== actor.id) {
      return { ok: false, error: "You can only edit your own articles" }
    }
    const slug = await uniqueSlug(data.slug ? toSlug(data.slug) : existing.slug, existing.id)
    const becomingPublished = status === "PUBLISHED" && existing.status !== "PUBLISHED"
    await prisma.$transaction(async (tx) => {
      await tx.article.update({
        where: { id: existing.id },
        data: {
          slug, coverImage: data.coverImage, featured: data.featured, status, primaryLocale,
          publishedAt: becomingPublished ? new Date() : existing.publishedAt,
          tags: { set: [], connectOrCreate: tagConnect },
        },
      })
      await tx.articleTranslation.deleteMany({
        where: { articleId: existing.id, locale: { notIn: translations.map((t) => t.locale) } },
      })
      for (const t of translations) {
        await tx.articleTranslation.upsert({
          where: { articleId_locale: { articleId: existing.id, locale: t.locale } },
          update: { title: t.title, excerpt: t.excerpt, body: t.body, sources: t.sources },
          create: { articleId: existing.id, locale: t.locale, title: t.title, excerpt: t.excerpt, body: t.body, sources: t.sources },
        })
        await tx.revision.create({ data: { articleId: existing.id, locale: t.locale, title: t.title, body: t.body, editorId: actor.id } })
      }
    })
    if (becomingPublished) void notifyNewArticle(existing.id).catch((e) => console.error("[notify] update", e))
    return { ok: true, slug, id: existing.id }
  }

  const slug = await uniqueSlug(toSlug(data.slug || slugSeed))
  const created = await prisma.article.create({
    data: {
      slug, coverImage: data.coverImage, featured: data.featured, status, primaryLocale,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
      authorId: actor.id,
      tags: { connectOrCreate: tagConnect },
      translations: { create: translations },
      revisions: { create: translations.map((t) => ({ locale: t.locale, title: t.title, body: t.body, editorId: actor.id })) },
    },
  })
  if (status === "PUBLISHED") void notifyNewArticle(created.id).catch((e) => console.error("[notify] create", e))
  return { ok: true, slug, id: created.id }
}
