import Link from "next/link"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getPublishedPreviews, type ArticlePreview, type CmsLocale } from "@/lib/cms/articles"
import { ArticleCard } from "@/components/articles/ArticleCard"
import { ArticleSearchPrompt } from "@/components/articles/ArticleSearchPrompt"
import { CmsCoverImage } from "@/components/articles/CmsCoverImage"
import { CoverArt } from "@/components/articles/CoverArt"
import { TopSubscribeModalButton } from "@/components/articles/TopSubscribeModalButton"
import { externalLinks } from "@/lib/external-links"
import { absoluteUrl, absoluteUrlForHost, shouldUseArticlePreviewFallback } from "@/lib/seo"
import { ArrowRight } from "lucide-react"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}): Promise<Metadata> {
  const { lang } = await searchParams
  const locale: CmsLocale = lang === "zh" ? "zh" : "en"
  const title = locale === "zh" ? "Subfrost 文章、研究与协议更新" : "Subfrost articles, research, and protocol updates"
  const description =
    locale === "zh"
      ? "阅读 Subfrost 关于比特币原生收益、frBTC、协议设计、产品发布与技术文档的最新文章。"
      : "Read Subfrost research, protocol notes, product updates, and documentation for Bitcoin-native yield, frBTC, and Bitcoin DeFi infrastructure."
  const url = absoluteUrl(locale === "zh" ? "/articles?lang=zh" : "/articles")
  const requestHeaders = await headers()
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  const proto = requestHeaders.get("x-forwarded-proto")
  const image = absoluteUrlForHost("/articles/opengraph-image", host, proto)

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        en: absoluteUrl("/articles"),
        zh: absoluteUrl("/articles?lang=zh"),
        "x-default": absoluteUrl("/articles"),
      },
    },
    openGraph: {
      title,
      description,
      type: "website",
      url,
      siteName: "Subfrost",
      images: [{ url: image, width: 1200, height: 630, alt: "Subfrost articles", type: "image/png" }],
      locale: locale === "zh" ? "zh_CN" : "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image, alt: "Subfrost articles" }],
    },
    keywords: [
      "Subfrost",
      "Bitcoin DeFi",
      "Bitcoin native yield",
      "frBTC",
      "Alkanes",
      "OP_RETURN",
      "Bitcoin Layer 0",
      "Bitcoin infrastructure",
    ],
  }
}

const articleCopy = {
  en: {
    articles: "All",
    browseByTopic: "Browse By Topic",
    featured: "Featured",
    recentPosts: "Recent Articles",
    noMatching: "No matching updates found.",
    noTopicPosts: "No published posts in this topic yet.",
    srTitle: "Subfrost articles",
    docsEyebrow: "Developer",
    docsSource: "Subfrost Docs",
  },
  zh: {
    articles: "全部",
    browseByTopic: "按主题浏览",
    featured: "精选",
    recentPosts: "最新",
    noMatching: "没有找到匹配的更新。",
    noTopicPosts: "此主题暂无已发布文章。",
    srTitle: "Subfrost 更新",
    docsEyebrow: "开发者",
    docsSource: "Subfrost 文档",
  },
} satisfies Record<CmsLocale, Record<string, string>>

const topicDefinitions = [
  {
    id: "research",
    title: { en: "Research", zh: "研究" },
    aliases: ["research", "bitcoin", "alkanes"],
  },
  {
    id: "protocol",
    title: { en: "Protocol", zh: "协议" },
    aliases: ["protocol", "operations", "ops", "frbtc", "bitcoin"],
  },
  {
    id: "docs",
    title: { en: "Developer", zh: "开发者" },
    aliases: ["docs", "documentation", "product", "release", "releases", "subfrost"],
  },
]

const docsBackfill = [
  {
    title: { en: "Docs", zh: "文档" },
    href: externalLinks.docs,
    excerpt: { en: "Canonical product guides, setup paths, protocol references, and technical components.", zh: "产品指南、设置路径、协议参考与技术组件的权威入口。" },
  },
  {
    title: { en: "API docs", zh: "API 文档" },
    href: externalLinks.apiDocs,
    excerpt: {
      en: "Endpoint references for balances, wrapping state, transactions, and app integrations.",
      zh: "余额、包装状态、交易与应用集成的端点参考。",
    },
  },
  {
    title: { en: "API login", zh: "API 登录" },
    href: externalLinks.apiLogin,
    excerpt: { en: "Sign in to the live API dashboard.", zh: "登录实时 API 控制台。" },
  },
]

function categoryLabel(tag: { slug: string; name: string }, locale: CmsLocale = "en") {
  const value = tag.slug.toLowerCase()
  if (value === "local-mock") return null
  if (["operations", "ops", "protocol", "frbtc"].includes(value)) return locale === "zh" ? "协议" : "Protocol"
  if (["product", "release", "releases", "docs", "documentation", "subfrost"].includes(value)) return locale === "zh" ? "开发者" : "Developer"
  if (["research", "bitcoin", "alkanes"].includes(value)) return locale === "zh" ? "研究" : tag.name
  return tag.name
}

function articleMatchesTopic(article: ArticlePreview, aliases: string[]) {
  return article.tags.some((tag) => {
    const slug = tag.slug.toLowerCase()
    const name = tag.name.toLowerCase()
    return aliases.includes(slug) || aliases.includes(name)
  })
}

function articleHref(slug: string, locale: CmsLocale) {
  return locale === "zh" ? `/articles/${slug}?lang=zh` : `/articles/${slug}`
}

function articleDate(value: string | null, locale: CmsLocale) {
  if (!value) return ""
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value))
}

function primaryCategory(article: ArticlePreview, locale: CmsLocale) {
  return article.tags.map((tag) => categoryLabel(tag, locale)).find((tag): tag is string => Boolean(tag))
}

function RecentMiniArticleCard({ a, locale, coverVariant }: { a: ArticlePreview; locale: CmsLocale; coverVariant: number | string }) {
  return (
    <Link href={articleHref(a.slug, locale)} className="flex items-start gap-3 overflow-hidden rounded-[8px] border p-3" style={{ borderColor: "color-mix(in srgb, var(--ed-ink) 8%, transparent)", background: "color-mix(in srgb, var(--ed-surface) 52%, transparent)" }} prefetch={false}>
      <div className="h-[56px] w-[56px] shrink-0 overflow-hidden rounded-[6px]">
        <CmsCoverImage src={a.coverImage} className="h-full w-full" fallbackVariant={coverVariant} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-display line-clamp-2 text-[15px] font-normal leading-[1.25]" style={{ color: "var(--ed-ink)" }}>
          {a.title}
        </h3>
        <div className="font-display mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[12px] font-medium" style={{ color: "var(--ed-muted)" }}>
          <span style={{ color: "var(--ed-ink)" }}>{primaryCategory(a, locale)}</span>
          {a.publishedAt ? <span>{articleDate(a.publishedAt, locale)}</span> : null}
        </div>
      </div>
    </Link>
  )
}

function RecentMiniDocCard({ doc, locale, copy }: { doc: (typeof docsBackfill)[number]; locale: CmsLocale; copy: typeof articleCopy.en }) {
  return (
    <a href={doc.href} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 overflow-hidden rounded-[8px] border p-3" style={{ borderColor: "color-mix(in srgb, var(--ed-ink) 8%, transparent)", background: "color-mix(in srgb, var(--ed-surface) 52%, transparent)" }}>
      <div className="h-[56px] w-[56px] shrink-0 overflow-hidden rounded-[6px]">
        <CoverArt className="h-full w-full" variant={`recent-${doc.href}`} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-display line-clamp-2 text-[15px] font-normal leading-[1.25]" style={{ color: "var(--ed-ink)" }}>
          {doc.title[locale]}
        </h3>
        <div className="font-display mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[12px] font-medium" style={{ color: "var(--ed-muted)" }}>
          <span style={{ color: "var(--ed-ink)" }}>{copy.docsEyebrow}</span>
          <span>{copy.docsSource}</span>
        </div>
      </div>
    </a>
  )
}

function DocsGridCard({ doc, locale, copy }: { doc: (typeof docsBackfill)[number]; locale: CmsLocale; copy: typeof articleCopy.en }) {
  return (
    <a href={doc.href} target="_blank" rel="noopener noreferrer" className="ed-card">
      <div className="ed-cover-frame aspect-[24/11]">
        <CoverArt className="h-full w-full" variant={doc.href} />
      </div>
      <div className="flex flex-1 flex-col pt-4">
        <h3 className="font-display text-balance text-[20px] font-normal leading-[1.28]" style={{ color: "var(--ed-ink)" }}>
          {doc.title[locale]}
        </h3>
        <div className="font-display mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[14px] font-medium" style={{ color: "var(--ed-muted)" }}>
          <span style={{ color: "var(--ed-ink)" }}>{copy.docsEyebrow}</span>
          <span>{copy.docsSource}</span>
        </div>
      </div>
    </a>
  )
}

export default async function ArticlesIndex({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; topic?: string }>
}) {
  const { lang, topic } = await searchParams
  const locale: CmsLocale = lang === "zh" ? "zh" : "en"
  const copy = articleCopy[locale]
  const requestHeaders = await headers()
  const allArticles = await getPublishedPreviews({
    limit: 30,
    locale,
    previewFallback: shouldUseArticlePreviewFallback(requestHeaders.get("host")),
  }).catch(() => [])
  const localizedTopics = topicDefinitions.map((item) => ({
    ...item,
    title: item.title[locale],
  }))
  const selectedTopic = localizedTopics.find((item) => item.id === topic)
  const isAllTopic = !selectedTopic
  const isDocsTopic = selectedTopic?.id === "docs"
  const articles = selectedTopic ? allArticles.filter((article) => articleMatchesTopic(article, selectedTopic.aliases)) : allArticles
  const [featuredLead] = allArticles
  const latest = allArticles.slice(1, 6)
  const recentDocs: Array<(typeof docsBackfill)[number]> = []
  const hasRecent = latest.length + recentDocs.length > 0
  const feedArticles = isAllTopic ? allArticles.slice(1) : articles
  const articleIndexHref = locale === "zh" ? "/articles?lang=zh" : "/articles"
  const topicHref = (id: string) => {
    const params = new URLSearchParams()
    if (locale === "zh") params.set("lang", "zh")
    params.set("topic", id)
    return `/articles?${params.toString()}`
  }
  const browseItems = [
    { id: "articles", title: copy.articles, href: articleIndexHref },
    ...localizedTopics.map((item) => ({ id: item.id, title: item.title, href: topicHref(item.id) })),
  ]
  return (
    <main className="relative overflow-hidden pb-8">
      <h1 className="sr-only">{copy.srTitle}</h1>

      <section style={{ background: "var(--ed-canvas)" }}>
        <div className="mx-auto max-w-[1440px] px-6 pb-2 pt-7 sm:px-8 sm:pb-3 sm:pt-[44px]">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <nav className="flex flex-wrap gap-x-6 gap-y-3" aria-label={copy.browseByTopic}>
              {browseItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  prefetch={false}
                  className="font-display inline-flex items-center text-[16px] font-normal leading-none"
                  style={{
                    color:
                      (!selectedTopic && item.id === "articles") || selectedTopic?.id === item.id
                        ? "var(--ed-ink)"
                        : "var(--ed-muted)",
                  }}
                >
                  {item.title}
                </Link>
              ))}
            </nav>
            <TopSubscribeModalButton locale={locale} />
          </div>
        </div>
      </section>

      <ArticleSearchPrompt articles={articles} locale={locale} />

      <div className="mx-auto max-w-[1440px] px-6 pt-0 sm:px-8 sm:pt-0">
        {articles.length === 0 && !featuredLead ? (
          isDocsTopic ? (
            <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {docsBackfill.map((doc) => (
                <DocsGridCard key={doc.href} doc={doc} locale={locale} copy={copy} />
              ))}
            </section>
          ) : (
            <div className="space-y-8">
              <div
                className="font-reading rounded-[8px] p-12 text-center text-[17px]"
                style={{ background: "color-mix(in srgb, var(--ed-surface) 68%, transparent)", color: "var(--ed-muted)" }}
              >
                {copy.noMatching}
              </div>
            </div>
          )
        ) : (
          <>
            <section id="featured" className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(270px,0.8fr)] lg:items-start">
              {featuredLead ? (
                <article className="rounded-[10px] p-4 sm:p-5" style={{ background: "color-mix(in srgb, var(--ed-surface) 58%, transparent)" }}>
                  <p className="ed-eyebrow mb-5">{copy.featured}</p>
                  <Link href={articleHref(featuredLead.slug, locale)} className="ed-card" prefetch={false}>
                    <div className="ed-cover-frame aspect-[24/11]">
                      <CmsCoverImage
                        src={featuredLead.coverImage}
                        className="h-full w-full"
                        fallbackVariant={0}
                        priority
                      />
                    </div>
                    <div className="flex flex-1 flex-col pt-5">
                      <h2
                        className="font-display text-balance text-[24px] font-normal leading-[1.2] sm:text-[28px]"
                        style={{ color: "var(--ed-ink)" }}
                      >
                        {featuredLead.title}
                      </h2>
                      <div className="font-display mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[14px] font-medium" style={{ color: "var(--ed-muted)" }}>
                        <span style={{ color: "var(--ed-ink)" }}>{primaryCategory(featuredLead, locale)}</span>
                        {featuredLead.publishedAt ? <span>{articleDate(featuredLead.publishedAt, locale)}</span> : null}
                      </div>
                    </div>
                  </Link>
                </article>
              ) : null}

              {isAllTopic && hasRecent ? (
                <aside className="rounded-[10px] p-4" style={{ background: "color-mix(in srgb, var(--ed-surface) 44%, transparent)" }}>
                  <p className="ed-eyebrow mb-4">{copy.recentPosts}</p>
                  <div className="space-y-3">
                    {latest.slice(0, 3).map((a, index) => (
                      <RecentMiniArticleCard key={`featured-recent-${a.slug}`} a={a} locale={locale} coverVariant={`featured-recent-${index}`} />
                    ))}
                    {recentDocs.slice(0, 3 - Math.min(3, latest.length)).map((doc) => (
                      <RecentMiniDocCard key={`featured-recent-${doc.href}`} doc={doc} locale={locale} copy={copy} />
                    ))}
                  </div>
                </aside>
              ) : null}
            </section>

            {feedArticles.length > 0 || isDocsTopic || isAllTopic ? (
              <section className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {feedArticles.map((a, index) => (
                  <ArticleCard key={a.slug} a={a} locale={locale} coverVariant={index + 2} />
                ))}
                {(isDocsTopic || isAllTopic) ? docsBackfill.map((doc) => (
                  <DocsGridCard key={doc.href} doc={doc} locale={locale} copy={copy} />
                )) : null}
              </section>
            ) : null}

          </>
        )}
      </div>
    </main>
  )
}
