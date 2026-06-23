import type { MetadataRoute } from "next"
import { absoluteUrl, articleUrl, authorUrl } from "@/lib/seo"
import { getPublishedArticleSeoEntries, getPublishedAuthorSeoEntries } from "@/lib/cms/articles"

export const dynamic = "force-dynamic"

function sitemapEntry(
  url: string,
  options: Omit<MetadataRoute.Sitemap[number], "url"> = {},
): MetadataRoute.Sitemap[number] {
  return { url, ...options }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const staticRoutes: MetadataRoute.Sitemap = [
    sitemapEntry(absoluteUrl("/"), { lastModified: now, changeFrequency: "daily", priority: 1 }),
    sitemapEntry(absoluteUrl("/articles"), { lastModified: now, changeFrequency: "daily", priority: 0.9 }),
    sitemapEntry(absoluteUrl("/articles?lang=zh"), { lastModified: now, changeFrequency: "daily", priority: 0.8 }),
    sitemapEntry(absoluteUrl("/support"), { lastModified: now, changeFrequency: "monthly", priority: 0.5 }),
    sitemapEntry(absoluteUrl("/privacy"), { lastModified: now, changeFrequency: "yearly", priority: 0.3 }),
    sitemapEntry(absoluteUrl("/terms"), { lastModified: now, changeFrequency: "yearly", priority: 0.3 }),
    sitemapEntry(absoluteUrl("/delete-account"), { lastModified: now, changeFrequency: "yearly", priority: 0.2 }),
  ]

  try {
    const [articles, authors] = await Promise.all([
      getPublishedArticleSeoEntries(),
      getPublishedAuthorSeoEntries(),
    ])

    const articleRoutes = articles.flatMap((article) => {
      const lastModified = new Date(article.updatedAt ?? article.publishedAt ?? now)
      const routes: MetadataRoute.Sitemap = [
        sitemapEntry(articleUrl(article.slug), {
          lastModified,
          changeFrequency: "weekly",
          priority: 0.8,
        }),
      ]
      if (article.availableLocales.includes("zh")) {
        routes.push(
          sitemapEntry(articleUrl(article.slug, "zh"), {
            lastModified,
            changeFrequency: "weekly",
            priority: 0.7,
          }),
        )
      }
      return routes
    })

    const authorRoutes = authors.flatMap((author) => {
      const lastModified = new Date(author.updatedAt ?? now)
      const routes: MetadataRoute.Sitemap = [
        sitemapEntry(authorUrl(author.id), {
          lastModified,
          changeFrequency: "weekly",
          priority: 0.4,
        }),
      ]
      if (author.hasChineseArticles) {
        routes.push(
          sitemapEntry(authorUrl(author.id, "zh"), {
            lastModified,
            changeFrequency: "weekly",
            priority: 0.35,
          }),
        )
      }
      return routes
    })

    return [...staticRoutes, ...articleRoutes, ...authorRoutes]
  } catch {
    return staticRoutes
  }
}
