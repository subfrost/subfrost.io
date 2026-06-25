import Link from "next/link"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getPublishedPreviews, type ArticlePreview, type CmsLocale } from "@/lib/cms/articles"
import { ArticleCard } from "@/components/articles/ArticleCard"
import { ArticleSearchPrompt } from "@/components/articles/ArticleSearchPrompt"
import { AuthorByline } from "@/components/articles/AuthorByline"
import { CmsCoverImage } from "@/components/articles/CmsCoverImage"
import { CoverArt } from "@/components/articles/CoverArt"
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
    recentPosts: "Recent",
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
    description: { en: "Mechanism design, Bitcoin execution, and market structure.", zh: "机制设计、比特币执行环境与市场结构研究。" },
    aliases: ["research", "bitcoin", "alkanes"],
  },
  {
    id: "protocol",
    title: { en: "Protocol", zh: "协议" },
    description: { en: "Settlement mechanics, custody surfaces, and live network behavior.", zh: "结算机制、托管边界与实时网络运行情况。" },
    aliases: ["protocol", "operations", "ops", "frbtc", "bitcoin"],
  },
  {
    id: "docs",
    title: { en: "Developer", zh: "开发者" },
    description: { en: "Product guides, release notes, and technical references.", zh: "产品指南、发布说明与技术参考资料。" },
    aliases: ["docs", "documentation", "product", "release", "releases", "subfrost"],
  },
]

const docsBackfill = [
  {
    title: { en: "Subfrost Overview", zh: "Subfrost 概览" },
    href: "https://docs.subfrost.io/",
    excerpt: { en: "Bitcoin DeFi needs new rails for native BTC to power advanced L1 applications.", zh: "比特币 DeFi 需要新的原生 BTC 轨道，用来支撑更高级的 L1 应用。" },
  },
  {
    title: { en: "Technical Overview", zh: "技术概览" },
    href: "https://docs.subfrost.io/introduction/technical-overview",
    excerpt: {
      en: "How Subfrost operates as Layer-0 infrastructure, using fraud proofs and ZK circuits to verify system integrity.",
      zh: "Subfrost 如何作为 Layer-0 基础设施运行，并使用欺诈证明与 ZK 电路验证系统完整性。",
    },
  },
  {
    title: { en: "Subfrost API Docs", zh: "Subfrost API 文档" },
    href: "https://docs.subfrost.io/introduction/subfrost-api-docs",
    excerpt: { en: "The entry point for Subfrost API documentation and Bitcoin-native app development paths.", zh: "Subfrost API 文档入口，以及构建比特币原生应用的开发路径。" },
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

function topicCoverOffset(topicId: string) {
  if (topicId === "research") return 1
  if (topicId === "protocol") return 3
  if (topicId === "docs") return 6
  return 1
}

function DocsBackfillCard({ doc, locale, copy, coverVariant }: { doc: (typeof docsBackfill)[number]; locale: CmsLocale; copy: typeof articleCopy.en; coverVariant?: number | string }) {
  return (
    <a href={doc.href} target="_blank" rel="noopener noreferrer" className="ed-card">
      <div className="ed-cover-frame">
        <CoverArt className="h-[220px] sm:h-[300px]" variant={coverVariant ?? doc.href} />
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
  const articles = await getPublishedPreviews({
    limit: 30,
    locale,
    previewFallback: shouldUseArticlePreviewFallback(requestHeaders.get("host")),
  }).catch(() => [])
  const [lead, ...rest] = articles
  const latest = rest.slice(0, 5)
  const recentDocs = docsBackfill.slice(0, Math.max(0, 5 - latest.length))
  const hasRecent = latest.length + recentDocs.length > 0
  const localizedTopics = topicDefinitions.map((topic) => ({
    ...topic,
    title: topic.title[locale],
    description: topic.description[locale],
  }))
  const selectedTopic = localizedTopics.find((item) => item.id === topic)
  const pageTitle = selectedTopic?.title ?? (locale === "zh" ? "全部" : "All")
  const topicSections = localizedTopics.map((topic) => ({
    ...topic,
    articles: articles.filter((article) => articleMatchesTopic(article, topic.aliases)).slice(0, 2),
  }))
  const selectedArticles = selectedTopic ? articles.filter((article) => articleMatchesTopic(article, selectedTopic.aliases)) : []
  const selectedInitialArticles = selectedArticles.slice(0, 9)
  const hasMoreSelectedArticles = selectedArticles.length > selectedInitialArticles.length
  const articleIndexHref = locale === "zh" ? "/articles?lang=zh" : "/articles"
  const topicHref = (id: string) => {
    const params = new URLSearchParams()
    if (locale === "zh") params.set("lang", "zh")
    params.set("topic", id)
    return `/articles?${params.toString()}`
  }
  const browseItems = [
    ...localizedTopics.map((topic) => ({ id: topic.id, title: topic.title, href: topicHref(topic.id) })),
    { id: "articles", title: copy.articles, href: articleIndexHref },
  ]
  return (
    <main className="relative overflow-hidden pb-8">
      <h1 className="sr-only">{copy.srTitle}</h1>

      <section style={{ background: "var(--ed-canvas)" }}>
        <div className="mx-auto max-w-[1440px] px-6 pb-9 pt-14 sm:px-8 sm:pb-10 sm:pt-[88px]">
          <h2 className="font-display text-[44px] font-normal leading-none sm:text-[52px]" style={{ color: "var(--ed-ink)" }}>
            {pageTitle}
          </h2>
          <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center">
            <nav className="flex flex-wrap gap-x-6 gap-y-3" aria-label={copy.browseByTopic}>
              {browseItems.map((topic) => (
                <Link
                  key={topic.id}
                  href={topic.href}
                  data-topic-filter
                  prefetch={false}
                  className="font-display inline-flex items-center text-[16px] font-normal leading-none"
                  style={{
                    color:
                      (!selectedTopic && topic.id === "articles") || selectedTopic?.id === topic.id
                        ? "var(--ed-ink)"
                        : "var(--ed-muted)",
                  }}
                >
                  {topic.title}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </section>

      <ArticleSearchPrompt articles={articles} locale={locale} />

      <div className="mx-auto max-w-[1440px] px-6 pt-4 sm:px-8 sm:pt-5">
        {articles.length === 0 ? (
          <div className="space-y-8">
            <div
              className="font-reading rounded-[8px] p-12 text-center text-[17px]"
              style={{ background: "color-mix(in srgb, var(--ed-surface) 68%, transparent)", color: "var(--ed-muted)" }}
            >
              {copy.noMatching}
            </div>
          </div>
        ) : (
          <>
            {selectedTopic ? (
              <section id={`topic-${selectedTopic.id}`} className="grid gap-x-8 gap-y-12 pt-4 sm:grid-cols-2 lg:grid-cols-3">
                {selectedTopic.id === "docs" ? (
                  docsBackfill.map((doc, index) => (
                    <DocsBackfillCard key={doc.href} doc={doc} locale={locale} copy={copy} coverVariant={topicCoverOffset(selectedTopic.id) + index} />
                  ))
                ) : selectedInitialArticles.length > 0 ? (
                  selectedInitialArticles.map((a, index) => (
                    <ArticleCard key={`${selectedTopic.id}-${a.slug}`} a={a} locale={locale} coverVariant={topicCoverOffset(selectedTopic.id) + index} />
                  ))
                ) : (
                  <div className="font-reading text-[17px]" style={{ color: "var(--ed-muted)" }}>
                    {copy.noTopicPosts}
                  </div>
                )}
                {hasMoreSelectedArticles ? (
                  <div className="col-span-full flex justify-center pt-6">
                    <Link
                      href={topicHref(selectedTopic.id)}
                      className="font-display rounded-full bg-black/[0.04] px-5 py-2 text-[14px] font-normal"
                      style={{ color: "var(--ed-ink)" }}
                    >
                      {locale === "zh" ? "加载更多" : "Load more"}
                    </Link>
                  </div>
                ) : null}
              </section>
            ) : (
              <>
                <section
                  id="featured"
                  className={`grid gap-10 ${hasRecent ? "lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.8fr)] xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,0.75fr)]" : "lg:max-w-[920px]"} lg:items-start`}
                >
              {lead ? (
                <article>
                  <p className="ed-eyebrow mb-5">{copy.featured}</p>
                  <Link href={articleHref(lead.slug, locale)} className="ed-card" prefetch={false}>
                    <div className="ed-cover-frame aspect-[24/11]">
                      <CmsCoverImage
                        src={lead.coverImage}
                        className="h-full w-full"
                        fallbackVariant={0}
                        priority
                      />
                    </div>
                    <div className="flex flex-1 flex-col pt-4">
                      <h2
                        className="font-display text-balance text-[21px] font-normal leading-[1.28] sm:text-[22px]"
                        style={{ color: "var(--ed-ink)" }}
                      >
                        {lead.title}
                      </h2>
                      <div className="font-display mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[14px] font-medium" style={{ color: "var(--ed-muted)" }}>
                        <span style={{ color: "var(--ed-ink)" }}>{primaryCategory(lead, locale)}</span>
                        {lead.publishedAt ? <span>{articleDate(lead.publishedAt, locale)}</span> : null}
                      </div>
                    </div>
                  </Link>
                </article>
              ) : null}

              {hasRecent ? (
                <aside className="lg:pl-5 xl:pl-8">
                  <div className="mb-7">
                    <p className="ed-eyebrow">{copy.recentPosts}</p>
                  </div>
                  <div className="space-y-9">
                    {latest.map((a) => (
                      <Link
                        key={a.slug}
                        href={articleHref(a.slug, locale)}
                        className="block"
                        prefetch={false}
                      >
                        <h3 className="font-display text-balance text-[20px] font-normal leading-[1.28]" style={{ color: "var(--ed-ink)" }}>
                          <span>{a.title}</span>
                          <ArrowRight className="ml-1 inline-block h-3 w-3 align-baseline" strokeWidth={2} aria-hidden="true" />
                        </h3>
                        <div className="font-display mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[14px] font-medium" style={{ color: "var(--ed-muted)" }}>
                          <span style={{ color: "var(--ed-ink)" }}>
                            {a.tags.map((tag) => categoryLabel(tag, locale)).find((tag): tag is string => Boolean(tag))}
                          </span>
                          {a.publishedAt ? <span>{articleDate(a.publishedAt, locale)}</span> : null}
                        </div>
                      </Link>
                    ))}
                    {recentDocs.map((doc) => (
                      <a
                        key={doc.href}
                        href={doc.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <h3 className="font-display text-balance text-[20px] font-normal leading-[1.28]" style={{ color: "var(--ed-ink)" }}>
                          <span>{doc.title[locale]}</span>
                          <ArrowRight className="ml-1 inline-block h-3 w-3 align-baseline" strokeWidth={2} aria-hidden="true" />
                        </h3>
                        <div className="font-display mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[14px] font-medium" style={{ color: "var(--ed-muted)" }}>
                          <span style={{ color: "var(--ed-ink)" }}>{copy.docsEyebrow}</span>
                          <span>{copy.docsSource}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </aside>
              ) : null}
                </section>

                <section className="mt-12 space-y-4">
              {topicSections.map((topic) => (
                <section
                  key={topic.id}
                  id={`topic-${topic.id}`}
                  className="grid scroll-mt-24 gap-8 pt-6 lg:grid-cols-[300px_minmax(0,1fr)]"
                >
                  <div>
                    <h3 className="font-display text-[30px] font-semibold" style={{ color: "var(--ed-ink)" }}>
                      {topic.title}
                    </h3>
                    <p className="font-reading mt-4 text-[16px] leading-[1.6]" style={{ color: "var(--ed-body)" }}>
                      {topic.description}
                    </p>
                  </div>
                  {topic.articles.length > 0 ? (
                    <div className="grid gap-6 md:grid-cols-2">
                      {topic.articles.map((a, index) => (
                        <ArticleCard key={`${topic.id}-${a.slug}`} a={a} locale={locale} coverVariant={topicCoverOffset(topic.id) + index} />
                      ))}
                    </div>
                  ) : topic.id === "docs" ? (
                    <div className="grid gap-6 md:grid-cols-3">
                      {docsBackfill.map((doc, index) => (
                        <DocsBackfillCard key={doc.href} doc={doc} locale={locale} copy={copy} coverVariant={topicCoverOffset(topic.id) + index} />
                      ))}
                    </div>
                  ) : (
                    <div className="flex min-h-[116px] items-center justify-center rounded-[8px] p-8 text-center" style={{ background: "color-mix(in srgb, var(--ed-surface) 54%, transparent)", color: "var(--ed-muted)" }}>
                      <p className="font-reading text-[15px]">{copy.noTopicPosts}</p>
                    </div>
                  )}
                </section>
              ))}

                </section>
              </>
            )}

          </>
        )}
      </div>
    </main>
  )
}
