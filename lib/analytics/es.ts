// Elasticsearch adapter for the Site analytics dashboard. Mirrors ga4Source:
// guarded, cached aggregations over subfrost-cdn-* normalized into the shapes
// in source.ts. All aggregations use the _source runtime fields (es-client) so
// they survive the heterogeneous per-index mappings.
import type { AnalyticsSource, AnalyticsDashboard, DateRange, VisitorsSeries, TopPageRow, TrafficSourceRow, ArticleEngagementRow } from "@/lib/analytics/source"
import { isEsConfigured } from "@/lib/analytics/source"
import { esSearch, esRangeBounds, RUNTIME_MAPPINGS } from "@/lib/analytics/es-client"
import { classifyChannel } from "@/lib/analytics/channel"
import { dwellBySlug, articleSlug, type SessionHit } from "@/lib/analytics/dwell"
import { rangeKey } from "@/lib/analytics/range"
import { cacheGetOrCompute } from "@/lib/redis"
import prisma from "@/lib/prisma"

const TTL = 900
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const rangeQuery = (r: DateRange) => ({ range: { ts: esRangeBounds(r) } })

// ---- visitors ----
export function normalizeVisitors(res: any): VisitorsSeries {
  const buckets = res?.aggregations?.by_day?.buckets ?? []
  const points = buckets.map((b: any) => ({
    date: String(b.key_as_string ?? "").slice(0, 10).replace(/-/g, ""),
    activeUsers: num(b.visitors?.value),
    sessions: num(b.sessions?.value),
    pageViews: num(b.doc_count),
  }))
  const totals = points.reduce((a: any, p: any) => ({
    activeUsers: a.activeUsers + p.activeUsers, sessions: a.sessions + p.sessions, pageViews: a.pageViews + p.pageViews,
  }), { activeUsers: 0, sessions: 0, pageViews: 0 })
  return { points, totals }
}
async function fetchVisitors(r: DateRange): Promise<VisitorsSeries> {
  return cacheGetOrCompute(`analytics:es:visitors:${rangeKey(r)}`, async () =>
    normalizeVisitors(await esSearch({
      size: 0, query: rangeQuery(r), runtime_mappings: RUNTIME_MAPPINGS,
      aggs: { by_day: { date_histogram: { field: "ts", calendar_interval: "day" },
        aggs: { visitors: { cardinality: { field: "visitor_key" } }, sessions: { cardinality: { field: "session_key" } } } } },
    })), TTL)
}

// ---- top pages ----
export function normalizeTopPages(res: any): TopPageRow[] {
  return (res?.aggregations?.top_paths?.buckets ?? []).map((b: any) => ({ path: b.key, title: null, pageViews: num(b.doc_count) }))
}
async function articleTitles(slugs: string[]): Promise<Map<string, string | null>> {
  if (!slugs.length) return new Map()
  const articles = await prisma.article.findMany({ where: { slug: { in: slugs } }, select: { slug: true, translations: { select: { title: true }, take: 1 } } })
  return new Map(articles.map((a) => [a.slug, a.translations[0]?.title ?? null]))
}
async function fetchTopPages(r: DateRange): Promise<TopPageRow[]> {
  return cacheGetOrCompute(`analytics:es:toppages:${rangeKey(r)}`, async () => {
    const rows = normalizeTopPages(await esSearch({
      size: 0, query: rangeQuery(r), runtime_mappings: RUNTIME_MAPPINGS,
      aggs: { top_paths: { terms: { field: "path_src", size: 20 } } },
    }))
    const titles = await articleTitles(rows.map((x) => articleSlug(x.path)).filter((s): s is string => !!s))
    return rows.map((x) => { const s = articleSlug(x.path); return s ? { ...x, title: titles.get(s) ?? null } : x })
  }, TTL)
}

// ---- traffic sources ----
export function normalizeTrafficSources(res: any): TrafficSourceRow[] {
  const buckets = res?.aggregations?.by_referer?.buckets ?? []
  const byChannel = new Map<string, { source: string | null; sessions: number }>()
  for (const b of buckets) {
    const referer = b.key === "__none__" ? null : b.key
    const channel = classifyChannel(referer, null, null)
    const sessions = num(b.sessions?.value)
    const prev = byChannel.get(channel)
    if (prev) prev.sessions += sessions
    else byChannel.set(channel, { source: referer, sessions })
  }
  return [...byChannel.entries()]
    .map(([channel, v]) => ({ channel, source: v.source, campaign: null, sessions: v.sessions }))
    .sort((a, b) => b.sessions - a.sessions)
}
async function fetchTrafficSources(r: DateRange): Promise<TrafficSourceRow[]> {
  return cacheGetOrCompute(`analytics:es:traffic:${rangeKey(r)}`, async () =>
    normalizeTrafficSources(await esSearch({
      size: 0, query: rangeQuery(r), runtime_mappings: RUNTIME_MAPPINGS,
      aggs: { by_referer: { terms: { field: "referer_src", size: 50, missing: "__none__" },
        aggs: { sessions: { cardinality: { field: "session_key" } } } } },
    })), TTL)
}

// ---- article engagement ----
const MAX_SESSION_PAGES = 50 // composite pages × 100 = session cap for dwell
async function collectArticleSessions(r: DateRange): Promise<SessionHit[][]> {
  const sessions: SessionHit[][] = []
  let after: Record<string, unknown> | undefined
  for (let page = 0; page < MAX_SESSION_PAGES; page++) {
    const res: any = await esSearch({
      size: 0, query: rangeQuery(r), runtime_mappings: RUNTIME_MAPPINGS,
      aggs: { sess: { composite: { size: 100, sources: [{ sk: { terms: { field: "session_key" } } }], ...(after ? { after } : {}) },
        aggs: { hits: { top_hits: { size: 50, _source: ["path", "ts"], sort: [{ ts: "asc" }] } } } } },
    })
    const agg = res?.aggregations?.sess
    if (!agg || !(agg.buckets?.length)) break
    for (const b of agg.buckets) {
      const hits: SessionHit[] = (b.hits?.hits?.hits ?? []).map((h: any) => ({ path: h._source?.path ?? "", ts: Date.parse(h._source?.ts ?? "") || 0 }))
      if (hits.some((h) => articleSlug(h.path))) sessions.push(hits)
    }
    if (!agg.after_key) break
    after = agg.after_key
    if (page === MAX_SESSION_PAGES - 1) console.warn(`[es analytics] dwell session cap hit (${MAX_SESSION_PAGES}×100) for range ${rangeKey(r)}; engagement is sampled`)
  }
  return sessions
}
async function fetchArticleEngagement(r: DateRange): Promise<ArticleEngagementRow[]> {
  return cacheGetOrCompute(`analytics:es:articles:${rangeKey(r)}`, async () => {
    const pvRes = await esSearch({
      size: 0, runtime_mappings: RUNTIME_MAPPINGS,
      query: { bool: { filter: [rangeQuery(r), { prefix: { path_src: "/articles/" } }] } },
      aggs: { arts: { terms: { field: "path_src", size: 50 } } },
    })
    const pv = new Map<string, { path: string; pageViews: number }>()
    for (const b of pvRes?.aggregations?.arts?.buckets ?? []) {
      const slug = articleSlug(b.key); if (!slug) continue
      pv.set(slug, { path: b.key, pageViews: num(b.doc_count) })
    }
    if (pv.size === 0) return []
    const dwell = dwellBySlug(await collectArticleSessions(r))
    const titles = await articleTitles([...pv.keys()])
    return [...pv.keys()].map((slug) => {
      const d = dwell.get(slug)
      return { slug, path: pv.get(slug)!.path, title: titles.get(slug) ?? null, pageViews: pv.get(slug)!.pageViews,
        avgEngagementSeconds: d && d.count > 0 ? d.totalMs / d.count / 1000 : null }
    }).sort((a, b) => b.pageViews - a.pageViews)
  }, TTL)
}

export const esSource: AnalyticsSource = {
  async getDashboard(range: DateRange): Promise<AnalyticsDashboard> {
    const [visitors, topPages, trafficSources, articleEngagement] = await Promise.all([
      fetchVisitors(range), fetchTopPages(range), fetchTrafficSources(range), fetchArticleEngagement(range),
    ])
    return { range, visitors, topPages, trafficSources, articleEngagement, configured: isEsConfigured() }
  },
}
