import prisma from "@/lib/prisma"
import { readingTime } from "@/lib/cms/slug"

export type CmsLocale = "en" | "zh"

export interface AuthorProfile {
  name: string
  avatarUrl: string | null
  bio: string | null
  twitter: string | null
}

export interface ArticlePreview {
  slug: string
  title: string
  excerpt: string
  coverImage: string | null
  publishedAt: string | null
  readingMinutes: number
  locale: CmsLocale
  availableLocales: CmsLocale[]
  author: AuthorProfile
  tags: { slug: string; name: string }[]
}

export interface ArticleFull extends ArticlePreview {
  body: string
}

type TranslationRow = { locale: string; title: string; excerpt: string; body: string }

function chooseTranslation(
  translations: TranslationRow[],
  primary: string,
  want: CmsLocale,
): TranslationRow | null {
  return (
    translations.find((t) => t.locale === want) ||
    translations.find((t) => t.locale === primary) ||
    translations[0] ||
    null
  )
}

const baseSelect = {
  slug: true,
  coverImage: true,
  publishedAt: true,
  primaryLocale: true,
  author: { select: { name: true, email: true, avatarUrl: true, bio: true, twitter: true } },
  tags: { select: { slug: true, name: true } },
  translations: { select: { locale: true, title: true, excerpt: true, body: true } },
} as const

type ArticleRow = {
  slug: string
  coverImage: string | null
  publishedAt: Date | null
  primaryLocale: string
  author: { name: string | null; email: string; avatarUrl: string | null; bio: string | null; twitter: string | null }
  tags: { slug: string; name: string }[]
  translations: TranslationRow[]
}

function toPreview(a: ArticleRow, want: CmsLocale): ArticlePreview | null {
  const t = chooseTranslation(a.translations, a.primaryLocale, want)
  if (!t) return null
  return {
    slug: a.slug,
    title: t.title,
    excerpt: t.excerpt,
    coverImage: a.coverImage,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
    readingMinutes: readingTime(t.body),
    locale: t.locale as CmsLocale,
    availableLocales: a.translations.map((x) => x.locale as CmsLocale),
    author: {
      name: a.author.name ?? a.author.email,
      avatarUrl: a.author.avatarUrl,
      bio: a.author.bio,
      twitter: a.author.twitter,
    },
    tags: a.tags,
  }
}

export async function getPublishedPreviews(opts: {
  limit?: number
  tag?: string
  featured?: boolean
  locale?: CmsLocale
} = {}): Promise<ArticlePreview[]> {
  const { limit = 20, tag, featured, locale = "en" } = opts
  const rows = (await prisma.article.findMany({
    where: {
      status: "PUBLISHED",
      ...(featured ? { featured: true } : {}),
      ...(tag ? { tags: { some: { slug: tag } } } : {}),
    },
    orderBy: { publishedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
    select: baseSelect,
  })) as ArticleRow[]
  return rows.map((r) => toPreview(r, locale)).filter((x): x is ArticlePreview => x !== null)
}

export async function getPublishedSlugs(): Promise<string[]> {
  const rows = await prisma.article.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true },
  })
  return rows.map((r) => r.slug)
}

export async function getPublishedArticle(
  slug: string,
  locale: CmsLocale = "en",
): Promise<ArticleFull | null> {
  const a = (await prisma.article.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: baseSelect,
  })) as ArticleRow | null
  if (!a) return null
  const t = chooseTranslation(a.translations, a.primaryLocale, locale)
  const preview = toPreview(a, locale)
  if (!t || !preview) return null
  return { ...preview, body: t.body }
}
