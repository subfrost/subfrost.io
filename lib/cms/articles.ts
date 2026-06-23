import prisma from "@/lib/prisma"
import { readingTime } from "@/lib/cms/slug"

export type CmsLocale = "en" | "zh"

export interface AuthorProfile {
  id: string
  name: string
  avatarUrl: string | null
  bio: string | null
  twitter: string | null
}

export interface AuthorPage extends AuthorProfile {
  articleCount: number
  joinedYear: number
}

export interface ArticlePreview {
  slug: string
  title: string
  excerpt: string
  coverImage: string | null
  publishedAt: string | null
  updatedAt: string | null
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
  updatedAt: true,
  primaryLocale: true,
  author: { select: { id: true, name: true, email: true, avatarUrl: true, bio: true, twitter: true } },
  tags: { select: { slug: true, name: true } },
  translations: { select: { locale: true, title: true, excerpt: true, body: true } },
} as const

type ArticleRow = {
  slug: string
  coverImage: string | null
  publishedAt: Date | null
  updatedAt: Date | null
  primaryLocale: string
  author: { id: string; name: string | null; email: string; avatarUrl: string | null; bio: string | null; twitter: string | null }
  tags: { slug: string; name: string }[]
  translations: TranslationRow[]
}

const previewFallbackAuthor: AuthorProfile = {
  id: "preview-editorial",
  name: "SUBFROST Editorial",
  avatarUrl: "/Logo.png",
  bio: "Research and product notes from the SUBFROST team.",
  twitter: "subfrost_io",
}

const previewFallbackArticles = [
  {
    slug: "bitcoin-liquidity-weekly-01",
    coverImage: null,
    publishedAt: "2026-06-22T12:00:00.000Z",
    updatedAt: "2026-06-22T12:00:00.000Z",
    featured: true,
    author: previewFallbackAuthor,
    tags: [
      { slug: "research", name: "Research" },
      { slug: "bitcoin", name: "Bitcoin" },
    ],
    translations: [
      {
        locale: "en",
        title: "Bitcoin Liquidity Weekly: Week 01",
        excerpt: "A field briefing on liquidity shifts across wraps, unwraps, and routing demand.",
        body: "# Bitcoin Liquidity Weekly: Week 01\n\nThis deploy-preview article is representative CMS content for design review only.\n\nBitcoin liquidity keeps rotating across native and wrapped surfaces. The useful question is not only where volume moves, but whether the settlement path remains observable, reversible only by the owner, and legible to operators watching the system.\n\n## Signals\n\n- Wrap demand remains strongest where users can preserve native BTC exposure.\n- Unwrap paths need clean status reporting before volume scales.\n- Routing quality compounds when telemetry is treated as product surface, not back-office plumbing.\n\n> Liquidity is only useful when the user can trust the path back home.\n\nThe production article body is still CMS-managed through Postgres. This fallback exists so pull-request previews can be reviewed without access to production editorial data.",
      },
      {
        locale: "zh",
        title: "比特币流动性周报：第 01 周",
        excerpt: "关于包装、解包与路由需求变化的现场简报。",
        body: "# 比特币流动性周报：第 01 周\n\n这是一篇仅用于部署预览设计审核的代表性 CMS 内容。\n\n比特币流动性正在原生资产与包装资产表面之间轮动。真正重要的问题不只是交易量流向哪里，而是结算路径是否可观察、是否只由所有者控制，并且是否便于运营团队理解系统状态。\n\n## 信号\n\n- 当用户可以保留原生 BTC 敞口时，包装需求最强。\n- 解包路径在规模扩大前需要清晰的状态反馈。\n- 当遥测被视为产品表面而不是后台管道时，路由质量会持续复利。\n\n> 只有当用户信任回家的路径时，流动性才真正有用。\n\n生产文章正文仍由 Postgres CMS 管理。这个回退只用于没有生产编辑数据的 PR 预览。",
      },
    ],
  },
  {
    slug: "frostwire-product-briefing",
    coverImage: null,
    publishedAt: "2026-06-21T12:00:00.000Z",
    updatedAt: "2026-06-21T12:00:00.000Z",
    featured: false,
    author: previewFallbackAuthor,
    tags: [
      { slug: "protocol", name: "Protocol" },
      { slug: "operations", name: "Operations" },
    ],
    translations: [
      {
        locale: "en",
        title: "Frostwire Product Briefing",
        excerpt: "What shipped this cycle, what changed operationally, and what to monitor next.",
        body: "# Frostwire Product Briefing\n\nThis deploy-preview article is representative CMS content for design review only.\n\nThe product surface is moving toward fewer assumptions and clearer operating loops. Every release should make custody boundaries easier to inspect and failure states faster to resolve.\n\n## What changed\n\n- Settlement telemetry is easier to scan.\n- Route failover states are clearer.\n- Operator notes are moving closer to the user-facing workflow.",
      },
      {
        locale: "zh",
        title: "Frostwire 产品简报",
        excerpt: "本周期发布了什么、运营层面有哪些变化，以及接下来应该监控什么。",
        body: "# Frostwire 产品简报\n\n这是一篇仅用于部署预览设计审核的代表性 CMS 内容。\n\n产品表面正在减少假设，并让运营循环更清晰。每一次发布都应该让托管边界更容易检查，让失败状态更快被解决。\n\n## 变化\n\n- 结算遥测更容易浏览。\n- 路由故障转移状态更清晰。\n- 运营说明正在更靠近用户工作流。",
      },
    ],
  },
  {
    slug: "bitcoin-risk-notes-custody-surfaces",
    coverImage: null,
    publishedAt: "2026-06-20T12:00:00.000Z",
    updatedAt: "2026-06-20T12:00:00.000Z",
    featured: false,
    author: previewFallbackAuthor,
    tags: [
      { slug: "research", name: "Research" },
      { slug: "frbtc", name: "frBTC" },
    ],
    translations: [
      {
        locale: "en",
        title: "Bitcoin Risk Notes: Custody Surfaces",
        excerpt: "A practical view of custody and operational surfaces that matter most this quarter.",
        body: "# Bitcoin Risk Notes: Custody Surfaces\n\nThis deploy-preview article is representative CMS content for design review only.\n\nRisk work starts by naming who can do what, when, and with which recovery path. A system that hides those answers is expensive before it is unsafe.\n\n## Focus areas\n\n1. Key-management boundaries.\n2. Incident escalation speed.\n3. Policy observability and audit depth.",
      },
      {
        locale: "zh",
        title: "比特币风险笔记：托管边界",
        excerpt: "本季度最重要的托管与运营表面的实用视角。",
        body: "# 比特币风险笔记：托管边界\n\n这是一篇仅用于部署预览设计审核的代表性 CMS 内容。\n\n风险工作首先要说清楚谁能做什么、什么时候能做，以及恢复路径是什么。一个隐藏这些答案的系统，在变得危险之前就已经很昂贵。\n\n## 关注点\n\n1. 密钥管理边界。\n2. 事件升级速度。\n3. 策略可观察性与审计深度。",
      },
    ],
  },
]

function usePreviewFallback(force = false) {
  return (
    force ||
    process.env.CONTEXT === "deploy-preview" ||
    process.env.NETLIFY === "true" ||
    process.env.DEPLOY_PRIME_URL?.includes("deploy-preview-") === true ||
    process.env.DEPLOY_URL?.includes("deploy-preview-") === true ||
    process.env.URL?.includes("deploy-preview-") === true ||
    process.env.NEXT_PUBLIC_ENABLE_ARTICLE_PREVIEW_FALLBACK === "true"
  )
}

function previewTranslation(
  translations: TranslationRow[],
  want: CmsLocale,
): TranslationRow {
  return translations.find((t) => t.locale === want) || translations.find((t) => t.locale === "en") || translations[0]
}

function previewArticleToPreview(
  article: (typeof previewFallbackArticles)[number],
  locale: CmsLocale,
): ArticlePreview {
  const translation = previewTranslation(article.translations, locale)
  return {
    slug: article.slug,
    title: translation.title,
    excerpt: translation.excerpt,
    coverImage: article.coverImage,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
    readingMinutes: readingTime(translation.body),
    locale: translation.locale as CmsLocale,
    availableLocales: article.translations.map((t) => t.locale as CmsLocale),
    author: article.author,
    tags: article.tags,
  }
}

function previewPreviews(opts: {
  limit?: number
  tag?: string
  featured?: boolean
  locale?: CmsLocale
} = {}): ArticlePreview[] {
  const { limit = 20, tag, featured, locale = "en" } = opts
  return previewFallbackArticles
    .filter((article) => (featured ? article.featured : true))
    .filter((article) => (tag ? article.tags.some((t) => t.slug === tag) : true))
    .slice(0, Math.min(Math.max(limit, 1), 50))
    .map((article) => previewArticleToPreview(article, locale))
}

function previewArticle(slug: string, locale: CmsLocale): ArticleFull | null {
  const article = previewFallbackArticles.find((item) => item.slug === slug)
  if (!article) return null
  const translation = previewTranslation(article.translations, locale)
  return {
    ...previewArticleToPreview(article, locale),
    body: translation.body,
  }
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
    updatedAt: a.updatedAt ? a.updatedAt.toISOString() : null,
    readingMinutes: readingTime(t.body),
    locale: t.locale as CmsLocale,
    availableLocales: a.translations.map((x) => x.locale as CmsLocale),
    author: {
      id: a.author.id,
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
  previewFallback?: boolean
} = {}): Promise<ArticlePreview[]> {
  const { limit = 20, tag, featured, locale = "en", previewFallback = false } = opts
  if (usePreviewFallback(previewFallback)) return previewPreviews(opts)

  try {
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
    if (rows.length === 0 && usePreviewFallback(previewFallback)) return previewPreviews(opts)
    return rows.map((r) => toPreview(r, locale)).filter((x): x is ArticlePreview => x !== null)
  } catch {
    if (usePreviewFallback(previewFallback)) return previewPreviews(opts)
    throw new Error("Unable to load published articles")
  }
}

export async function getPublishedSlugs(): Promise<string[]> {
  try {
    const rows = await prisma.article.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true },
    })
    if (rows.length === 0 && usePreviewFallback()) return previewFallbackArticles.map((article) => article.slug)
    return rows.map((r) => r.slug)
  } catch {
    if (usePreviewFallback()) return previewFallbackArticles.map((article) => article.slug)
    throw new Error("Unable to load published article slugs")
  }
}

export interface PublishedArticleSeoEntry {
  slug: string
  publishedAt: string | null
  updatedAt: string | null
  availableLocales: CmsLocale[]
}

export async function getPublishedArticleSeoEntries(limit = 500): Promise<PublishedArticleSeoEntry[]> {
  try {
    const rows = await prisma.article.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: Math.min(Math.max(limit, 1), 1000),
      select: {
        slug: true,
        publishedAt: true,
        updatedAt: true,
        translations: { select: { locale: true } },
      },
    })
    if (rows.length === 0 && usePreviewFallback()) {
      return previewFallbackArticles.map((article) => ({
        slug: article.slug,
        publishedAt: article.publishedAt,
        updatedAt: article.updatedAt,
        availableLocales: article.translations.map((t) => t.locale as CmsLocale),
      }))
    }
    return rows.map((row) => ({
      slug: row.slug,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      availableLocales: row.translations.map((x) => x.locale as CmsLocale),
    }))
  } catch {
    if (usePreviewFallback()) {
      return previewFallbackArticles.map((article) => ({
        slug: article.slug,
        publishedAt: article.publishedAt,
        updatedAt: article.updatedAt,
        availableLocales: article.translations.map((t) => t.locale as CmsLocale),
      }))
    }
    throw new Error("Unable to load article SEO entries")
  }
}

export interface PublishedAuthorSeoEntry {
  id: string
  updatedAt: string | null
  hasChineseArticles: boolean
}

export async function getPublishedAuthorSeoEntries(limit = 500): Promise<PublishedAuthorSeoEntry[]> {
  try {
    const rows = await prisma.user.findMany({
      where: {
        active: true,
        articles: { some: { status: "PUBLISHED" } },
      },
      orderBy: { updatedAt: "desc" },
      take: Math.min(Math.max(limit, 1), 1000),
      select: {
        id: true,
        updatedAt: true,
        articles: {
          where: { status: "PUBLISHED" },
          select: { translations: { select: { locale: true } } },
        },
      },
    })
    if (rows.length === 0 && usePreviewFallback()) {
      return [{ id: previewFallbackAuthor.id, updatedAt: "2026-06-22T12:00:00.000Z", hasChineseArticles: true }]
    }
    return rows.map((row) => ({
      id: row.id,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      hasChineseArticles: row.articles.some((article) => article.translations.some((t) => t.locale === "zh")),
    }))
  } catch {
    if (usePreviewFallback()) {
      return [{ id: previewFallbackAuthor.id, updatedAt: "2026-06-22T12:00:00.000Z", hasChineseArticles: true }]
    }
    throw new Error("Unable to load author SEO entries")
  }
}

export async function getPublishedArticle(
  slug: string,
  locale: CmsLocale = "en",
  opts: { previewFallback?: boolean } = {},
): Promise<ArticleFull | null> {
  const previewFallback = opts.previewFallback ?? false
  if (usePreviewFallback(previewFallback)) return previewArticle(slug, locale)

  try {
    const a = (await prisma.article.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: baseSelect,
    })) as ArticleRow | null
    if (!a) return usePreviewFallback(previewFallback) ? previewArticle(slug, locale) : null
    const t = chooseTranslation(a.translations, a.primaryLocale, locale)
    const preview = toPreview(a, locale)
    if (!t || !preview) return null
    return { ...preview, body: t.body }
  } catch {
    if (usePreviewFallback(previewFallback)) return previewArticle(slug, locale)
    throw new Error("Unable to load published article")
  }
}

// Public author profile + how many published articles they have. Returns null
// for unknown/inactive authors so the route can 404.
export async function getAuthorProfile(id: string, opts: { previewFallback?: boolean } = {}): Promise<AuthorPage | null> {
  const previewFallback = opts.previewFallback ?? false
  if (usePreviewFallback(previewFallback) && id === previewFallbackAuthor.id) {
    return { ...previewFallbackAuthor, articleCount: previewFallbackArticles.length, joinedYear: 2026 }
  }

  try {
    const u = await prisma.user.findFirst({
      where: { id, active: true },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        bio: true,
        twitter: true,
        createdAt: true,
        _count: { select: { articles: { where: { status: "PUBLISHED" } } } },
      },
    })
    if (!u) {
      if (usePreviewFallback(previewFallback) && id === previewFallbackAuthor.id) {
        return { ...previewFallbackAuthor, articleCount: previewFallbackArticles.length, joinedYear: 2026 }
      }
      return null
    }
    return {
      id: u.id,
      name: u.name ?? u.email,
      avatarUrl: u.avatarUrl,
      bio: u.bio,
      twitter: u.twitter,
      articleCount: u._count.articles,
      joinedYear: u.createdAt.getFullYear(),
    }
  } catch {
    if (usePreviewFallback(previewFallback) && id === previewFallbackAuthor.id) {
      return { ...previewFallbackAuthor, articleCount: previewFallbackArticles.length, joinedYear: 2026 }
    }
    throw new Error("Unable to load author profile")
  }
}

// Published previews authored by a given user, newest first.
export async function getAuthorArticles(
  id: string,
  locale: CmsLocale = "en",
  opts: { previewFallback?: boolean } = {},
): Promise<ArticlePreview[]> {
  const previewFallback = opts.previewFallback ?? false
  if (usePreviewFallback(previewFallback) && id === previewFallbackAuthor.id) {
    return previewPreviews({ limit: previewFallbackArticles.length, locale })
  }

  try {
    const rows = (await prisma.article.findMany({
      where: { status: "PUBLISHED", authorId: id },
      orderBy: { publishedAt: "desc" },
      take: 50,
      select: baseSelect,
    })) as ArticleRow[]
    if (rows.length === 0 && usePreviewFallback(previewFallback) && id === previewFallbackAuthor.id) {
      return previewPreviews({ limit: 50, locale })
    }
    return rows.map((r) => toPreview(r, locale)).filter((x): x is ArticlePreview => x !== null)
  } catch {
    if (usePreviewFallback(previewFallback) && id === previewFallbackAuthor.id) {
      return previewPreviews({ limit: 50, locale })
    }
    throw new Error("Unable to load author articles")
  }
}
