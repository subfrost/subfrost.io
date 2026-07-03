import { getPublishedPreviews } from "@/lib/cms/articles"
import { getPublishedPushesForFeed, type PushRow } from "@/lib/cms/marketing-pushes"
import { buildRssXml, type RssItem } from "@/lib/cms/rss"

export const dynamic = "force-dynamic"

const SITE = "https://subfrost.io"

function pushItem(p: PushRow): RssItem {
  const link = p.article ? `${SITE}/articles/${p.article.slug}` : p.refUrl || SITE
  return {
    title: p.title,
    link,
    guid: `push:${p.id}`,
    pubDate: p.publishedAt ?? p.createdAt,
    description: p.notes || `${p.channel} push`,
    contentHtml: null,
  }
}

export async function GET(): Promise<Response> {
  const [articles, pushes] = await Promise.all([
    getPublishedPreviews({ limit: 30 }).catch(() => []),
    getPublishedPushesForFeed(30).catch(() => []),
  ])

  const articleItems: RssItem[] = articles.map((a) => ({
    title: a.title,
    link: `${SITE}/articles/${a.slug}`,
    guid: `article:${a.slug}`,
    pubDate: a.publishedAt ? new Date(a.publishedAt) : new Date(0),
    description: a.excerpt,
    contentHtml: null,
  }))

  const items = [...articleItems, ...pushes.map(pushItem)].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())

  const xml = buildRssXml(
    { title: "SUBFROST", link: SITE, description: "SUBFROST articles and updates", selfUrl: `${SITE}/feed.xml` },
    items,
  )
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  })
}
