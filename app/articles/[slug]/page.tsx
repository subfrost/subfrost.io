import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getPublishedArticle, type CmsLocale } from "@/lib/cms/articles"
import { Markdown } from "@/lib/cms/markdown"
import { absoluteUrlForHost, articleUrl, authorUrl, shouldUseArticlePreviewFallback, siteName } from "@/lib/seo"

export const dynamic = "force-dynamic"

const articlePageCopy = {
  en: {
    article: "Article",
    notFound: "Not found",
  },
  zh: {
    article: "文章",
    notFound: "未找到",
  },
} satisfies Record<CmsLocale, Record<string, string>>

function categoryLabel(tag: { slug: string; name: string }, locale: CmsLocale) {
  const value = tag.slug.toLowerCase()
  if (value === "local-mock") return null
  if (["operations", "ops", "protocol", "frbtc"].includes(value)) return locale === "zh" ? "协议" : "Protocol"
  if (["product", "release", "releases", "docs", "documentation", "subfrost"].includes(value)) return locale === "zh" ? "开发者" : "Developer"
  if (["research", "bitcoin", "alkanes"].includes(value)) return locale === "zh" ? "研究" : tag.name
  return tag.name
}

export async function generateMetadata({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const { lang } = await searchParams
  const locale: CmsLocale = lang === "zh" ? "zh" : "en"
  const requestHeaders = await headers()
  const a = await getPublishedArticle(slug, locale, {
    previewFallback: shouldUseArticlePreviewFallback(requestHeaders.get("host")),
  }).catch(() => null)
  if (!a) return { title: articlePageCopy[locale].notFound }
  const url = articleUrl(slug, locale)
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  const proto = requestHeaders.get("x-forwarded-proto")
  const image = a.coverImage ? absoluteUrlForHost(a.coverImage, host, proto) : absoluteUrlForHost("/articles/opengraph-image", host, proto)
  const imageMeta = a.coverImage
    ? { url: image, alt: a.title }
    : { url: image, width: 1200, height: 630, alt: a.title, type: "image/png" }
  const tagNames = a.tags.map((tag) => categoryLabel(tag, locale)).filter((tag): tag is string => Boolean(tag))
  return {
    title: `${a.title} — SUBFROST`,
    description: a.excerpt,
    alternates: {
      canonical: url,
      languages: {
        en: articleUrl(slug),
        ...(a.availableLocales.includes("zh") ? { zh: articleUrl(slug, "zh") } : {}),
        "x-default": articleUrl(slug),
      },
    },
    authors: [{ name: a.author.name, url: authorUrl(a.author.id, locale) }],
    keywords: ["SUBFROST", ...tagNames, "Bitcoin", "Bitcoin DeFi", "frBTC"],
    openGraph: {
      title: a.title,
      description: a.excerpt,
      type: "article",
      url,
      siteName,
      publishedTime: a.publishedAt ?? undefined,
      modifiedTime: a.updatedAt ?? undefined,
      authors: [a.author.name],
      tags: tagNames,
      images: [imageMeta],
      locale: locale === "zh" ? "zh_CN" : "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: a.title,
      description: a.excerpt,
      images: [{ url: image, alt: a.title }],
    },
  }
}

export default async function ArticlePage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { slug } = await params
  const { lang } = await searchParams
  const locale: CmsLocale = lang === "zh" ? "zh" : "en"
  const copy = articlePageCopy[locale]
  const requestHeaders = await headers()
  const a = await getPublishedArticle(slug, locale, {
    previewFallback: shouldUseArticlePreviewFallback(requestHeaders.get("host")),
  }).catch(() => null)
  if (!a) notFound()
  const primaryTag = a.tags.map((tag) => categoryLabel(tag, locale)).find((tag): tag is string => Boolean(tag)) ?? copy.article
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.excerpt,
    image: a.coverImage ? [a.coverImage] : undefined,
    datePublished: a.publishedAt ?? undefined,
    dateModified: a.updatedAt ?? a.publishedAt ?? undefined,
    inLanguage: locale === "zh" ? "zh-CN" : "en-US",
    mainEntityOfPage: articleUrl(slug, locale),
    author: {
      "@type": "Person",
      name: a.author.name,
      url: authorUrl(a.author.id, locale),
    },
    publisher: {
      "@type": "Organization",
      name: siteName,
      url: "https://subfrost.io",
      logo: {
        "@type": "ImageObject",
        url: "https://subfrost.io/Logo.png",
      },
    },
    keywords: a.tags.map((tag) => categoryLabel(tag, locale)).filter(Boolean).join(", "),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <article className="mx-auto px-6 pb-20 pt-24 sm:px-8 lg:pt-28">
        <header className="mx-auto max-w-[920px] text-center">
          <div className="font-display mb-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[14px] font-medium" style={{ color: "var(--ed-muted)" }}>
            {a.publishedAt ? (
              <span>{new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(a.publishedAt))}</span>
            ) : null}
            <span>{primaryTag}</span>
          </div>

          <h1
            className="font-display mx-auto max-w-[920px] text-balance text-[38px] font-medium leading-[1.02] sm:text-[56px] lg:text-[64px]"
            style={{ color: "var(--ed-ink)" }}
          >
            {a.title}
          </h1>

          {a.excerpt ? (
            <p className="font-display mx-auto mt-7 max-w-[620px] text-[17px] leading-[1.55]" style={{ color: "var(--ed-ink)" }}>
              {a.excerpt}
            </p>
          ) : null}
        </header>

        <div className="mx-auto mt-24 max-w-[680px]">
          <Markdown variant="article">{a.body}</Markdown>
        </div>
      </article>
    </>
  )
}
