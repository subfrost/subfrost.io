import prisma from "@/lib/prisma"
import type { MarketingPush, RecurringPush } from "@prisma/client"

export type PushRow = MarketingPush & { article: { slug: string; title: string | null } | null }

const includeArticle = {
  article: { select: { slug: true, translations: { select: { title: true, locale: true }, take: 1 } } },
} as const

function normalize(row: MarketingPush & { article: { slug: string; translations: { title: string }[] } | null }): PushRow {
  return { ...row, article: row.article ? { slug: row.article.slug, title: row.article.translations[0]?.title ?? null } : null }
}

export async function listPushes(): Promise<PushRow[]> {
  const rows = await prisma.marketingPush.findMany({ include: includeArticle, orderBy: { createdAt: "desc" } })
  return rows.map(normalize)
}

export async function listRecurringRules(): Promise<RecurringPush[]> {
  return prisma.recurringPush.findMany({ orderBy: { createdAt: "asc" } })
}

export async function getPublishedPushesForFeed(limit = 30): Promise<PushRow[]> {
  const rows = await prisma.marketingPush.findMany({
    where: { status: "PUBLISHED" },
    include: includeArticle,
    orderBy: { publishedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
  })
  return rows.map(normalize)
}
