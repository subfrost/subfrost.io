import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getPublishedArticle, type CmsLocale } from "@/lib/cms/articles"
import { ArticleView, categoryLabel } from "@/components/cms/ArticleView"
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
      <ArticleView
        article={{ title: a.title, excerpt: a.excerpt, body: a.body, publishedAt: a.publishedAt, tags: a.tags }}
        locale={locale}
      />
    </>
  )
}
