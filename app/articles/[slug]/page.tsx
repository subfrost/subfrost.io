import { notFound } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"
import { headers, cookies } from "next/headers"
import { getPublishedArticle, type CmsLocale } from "@/lib/cms/articles"
import { resolveArticleLocale } from "@/lib/i18n/resolve"
import { LOCALE_COOKIE } from "@/lib/i18n/cookie"
import { ArticleView, categoryLabel } from "@/components/cms/ArticleView"
import { TopSubscribeModalButton } from "@/components/articles/TopSubscribeModalButton"
import { absoluteUrlForHost, articleUrl, authorUrl, shouldUseArticlePreviewFallback, siteName } from "@/lib/seo"
import { ArrowLeft } from "lucide-react"

export const dynamic = "force-dynamic"

const articlePageCopy = {
  en: {
    article: "Article",
    notFound: "Not found",
    backToArticles: "Back to Articles",
  },
  zh: {
    article: "文章",
    notFound: "未找到",
    backToArticles: "返回文章列表",
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
  const cookieStore = await cookies()
  const locale: CmsLocale = resolveArticleLocale(lang, cookieStore.get(LOCALE_COOKIE)?.value)
  const requestHeaders = await headers()
  const a = await getPublishedArticle(slug, locale, {
    previewFallback: shouldUseArticlePreviewFallback(requestHeaders.get("host")),
  }).catch(() => null)
  if (!a) return { title: articlePageCopy[locale].notFound }
  const url = articleUrl(slug, locale)
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  const proto = requestHeaders.get("x-forwarded-proto")
  const image = absoluteUrlForHost(`/articles/${slug}/opengraph-image`, host, proto)
  const imageMeta = { url: image, width: 1200, height: 630, alt: a.title, type: "image/png" }
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
    authors: [a.author, ...a.coAuthors].map((au) => ({ name: au.name, url: authorUrl(au.id, locale) })),
    keywords: ["SUBFROST", ...tagNames, "Bitcoin", "Bitcoin DeFi", "frBTC"],
    openGraph: {
      title: a.title,
      description: a.excerpt,
      type: "article",
      url,
      siteName,
      publishedTime: a.publishedAt ?? undefined,
      modifiedTime: a.updatedAt ?? undefined,
      authors: [a.author, ...a.coAuthors].map((au) => au.name),
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
  const cookieStore = await cookies()
  const locale: CmsLocale = resolveArticleLocale(lang, cookieStore.get(LOCALE_COOKIE)?.value)
  const copy = articlePageCopy[locale]
  const articleIndexHref = locale === "zh" ? "/articles?lang=zh" : "/articles"
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
      <div className="mx-auto max-w-[920px] px-6 pb-2 pt-8 sm:px-8 sm:pt-10">
        <div className="flex items-center justify-between gap-4">
          <Link
            href={articleIndexHref}
            className="font-display inline-flex items-center gap-2 text-[14px] font-medium transition-opacity hover:opacity-70"
            style={{ color: "var(--ed-ink)" }}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            <span>{copy.backToArticles}</span>
          </Link>
          <TopSubscribeModalButton locale={locale} />
        </div>
      </div>
      <ArticleView
        article={{ title: a.title, excerpt: a.excerpt, body: a.body, sources: a.sources, publishedAt: a.publishedAt, tags: a.tags, author: a.author, coAuthors: a.coAuthors, readingMinutes: a.readingMinutes }}
        locale={locale}
      />
    </>
  )
}
