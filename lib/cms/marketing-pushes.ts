import prisma from "@/lib/prisma"
import type { MarketingPush, RecurringPush } from "@prisma/client"

export type PushRow = MarketingPush & { article: { slug: string; title: string | null } | null }

const includeArticle = {
  article: { select: { slug: true, primaryLocale: true, translations: { select: { title: true, locale: true } } } },
} as const

function normalize(
  row: MarketingPush & {
    article: { slug: string; primaryLocale: string; translations: { title: string; locale: string }[] } | null
  },
): PushRow {
  if (!row.article) return { ...row, article: null }
  const { slug, primaryLocale, translations } = row.article
  const title = translations.find((t) => t.locale === primaryLocale)?.title ?? translations[0]?.title ?? null
  return { ...row, article: { slug, title } }
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
