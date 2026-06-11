import { prisma } from "@/lib/prisma"
import { readingTime } from "@/lib/slug"
import type { ArticlePreview } from "@/components/ArticleCard"

const previewSelect = {
  slug: true,
  title: true,
  excerpt: true,
  coverImage: true,
  publishedAt: true,
  body: true,
  author: { select: { name: true, email: true } },
  tags: { select: { slug: true, name: true } },
} as const

type Row = {
  slug: string
  title: string
  excerpt: string
  coverImage: string | null
  publishedAt: Date | null
  body: string
  author: { name: string | null; email: string }
  tags: { slug: string; name: string }[]
}

function toPreview(a: Row): ArticlePreview {
  return {
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
    coverImage: a.coverImage,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
    author: a.author.name ?? a.author.email,
    tags: a.tags,
    readingMinutes: readingTime(a.body),
  }
}

export async function getPublishedPreviews(opts: {
  limit?: number
  tag?: string
  featured?: boolean
} = {}): Promise<ArticlePreview[]> {
  const { limit = 20, tag, featured } = opts
  const rows = await prisma.article.findMany({
    where: {
      status: "PUBLISHED",
      ...(featured ? { featured: true } : {}),
      ...(tag ? { tags: { some: { slug: tag } } } : {}),
    },
    orderBy: { publishedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
    select: previewSelect,
  })
  return rows.map(toPreview)
}

export async function getPublishedSlugs(): Promise<string[]> {
  const rows = await prisma.article.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true },
  })
  return rows.map((r) => r.slug)
}

export async function getPublishedArticle(slug: string) {
  const a = await prisma.article.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      ...previewSelect,
      coverImage: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  if (!a) return null
  return {
    ...toPreview(a as Row),
    body: a.body,
  }
}
