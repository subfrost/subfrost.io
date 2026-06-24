// GA4 Data API adapter. Raw runReport REST calls (bearer from google-auth) +
// normalizers into the shapes in source.ts. Every function is guarded; a missing
// token, HTTP error, or malformed body yields an empty/zeroed result, never throws.
import { getGoogleAccessToken } from "@/lib/analytics/google-auth"
import type { VisitorsSeries, TopPageRow, TrafficSourceRow, AnalyticsSource, AnalyticsDashboard, DateRange, ArticleEngagementRow } from "@/lib/analytics/source"
import { isAnalyticsConfigured, emptyDashboard } from "@/lib/analytics/source"
import { rangeKey } from "@/lib/analytics/range"
import { cacheGetOrCompute } from "@/lib/redis"
import prisma from "@/lib/prisma"

const DATA_API = "https://analyticsdata.googleapis.com/v1beta"

export interface GaRow { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }
export interface GaReportResponse { rows?: GaRow[] }

const num = (v: string | undefined): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const str = (v: string | undefined): string | null => (v && v !== "(not set)" ? v : null)

export async function runReport(body: Record<string, unknown>): Promise<GaReportResponse | null> {
  const token = await getGoogleAccessToken()
  const propertyId = process.env.GA4_PROPERTY_ID
  if (!token || !propertyId) return null
  try {
    const res = await fetch(`${DATA_API}/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    return (await res.json()) as GaReportResponse
  } catch {
    return null
  }
}

export function normalizeVisitors(res: GaReportResponse | null): VisitorsSeries {
  const rows = res?.rows ?? []
  const points = rows.map((r) => ({
    date: r.dimensionValues?.[0]?.value ?? "",
    activeUsers: num(r.metricValues?.[0]?.value),
    sessions: num(r.metricValues?.[1]?.value),
    pageViews: num(r.metricValues?.[2]?.value),
  }))
  const totals = points.reduce(
    (acc, p) => ({
      activeUsers: acc.activeUsers + p.activeUsers,
      sessions: acc.sessions + p.sessions,
      pageViews: acc.pageViews + p.pageViews,
    }),
    { activeUsers: 0, sessions: 0, pageViews: 0 },
  )
  return { points, totals }
}

export function normalizeTopPages(res: GaReportResponse | null): TopPageRow[] {
  return (res?.rows ?? []).map((r) => ({
    path: r.dimensionValues?.[0]?.value ?? "",
    title: str(r.dimensionValues?.[1]?.value),
    pageViews: num(r.metricValues?.[0]?.value),
  }))
}

export function normalizeTrafficSources(res: GaReportResponse | null): TrafficSourceRow[] {
  return (res?.rows ?? []).map((r) => ({
    channel: r.dimensionValues?.[0]?.value ?? "",
    source: str(r.dimensionValues?.[1]?.value),
    campaign: str(r.dimensionValues?.[2]?.value),
    sessions: num(r.metricValues?.[0]?.value),
  }))
}

const TTL = 900 // 15 min

/** "/articles/{slug}" → slug (strips query/hash). Non-article paths → null. */
export function parseArticleSlug(path: string): string | null {
  const m = path.match(/^\/articles\/([^/?#]+)/)
  return m ? m[1] : null
}

function dateRanges(r: DateRange) {
  return [{ startDate: r.start, endDate: r.end }]
}

async function fetchVisitors(r: DateRange) {
  return cacheGetOrCompute(`analytics:visitors:${rangeKey(r)}`, async () =>
    normalizeVisitors(
      await runReport({
        dateRanges: dateRanges(r),
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
    ), TTL)
}

async function fetchTopPages(r: DateRange) {
  return cacheGetOrCompute(`analytics:toppages:${rangeKey(r)}`, async () =>
    normalizeTopPages(
      await runReport({
        dateRanges: dateRanges(r),
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 20,
      }),
    ), TTL)
}

async function fetchTrafficSources(r: DateRange) {
  return cacheGetOrCompute(`analytics:traffic:${rangeKey(r)}`, async () =>
    normalizeTrafficSources(
      await runReport({
        dateRanges: dateRanges(r),
        dimensions: [{ name: "sessionDefaultChannelGroup" }, { name: "sessionSource" }, { name: "sessionCampaignName" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 20,
      }),
    ), TTL)
}

async function fetchArticleEngagement(r: DateRange): Promise<ArticleEngagementRow[]> {
  return cacheGetOrCompute(`analytics:articles:${rangeKey(r)}`, async () => {
    const res = await runReport({
      dateRanges: dateRanges(r),
      dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
      metrics: [{ name: "screenPageViews" }, { name: "userEngagementDuration" }],
      dimensionFilter: { filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: "/articles/" } } },
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 50,
    })
    const rows = (res?.rows ?? [])
      .map((row) => {
        const path = row.dimensionValues?.[0]?.value ?? ""
        const slug = parseArticleSlug(path)
        if (!slug) return null
        const pageViews = Number(row.metricValues?.[0]?.value) || 0
        const engagement = Number(row.metricValues?.[1]?.value) || 0
        return {
          slug, path,
          gaTitle: row.dimensionValues?.[1]?.value ?? null,
          pageViews,
          avgEngagementSeconds: pageViews > 0 ? engagement / pageViews : null,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    if (rows.length === 0) return []
    const articles = await prisma.article.findMany({
      where: { slug: { in: rows.map((x) => x.slug) } },
      select: { slug: true, translations: { select: { title: true }, take: 1 } },
    })
    const titleBySlug = new Map(articles.map((a) => [a.slug, a.translations[0]?.title ?? null]))
    return rows.map(({ gaTitle, ...x }) => ({ ...x, title: titleBySlug.get(x.slug) ?? gaTitle }))
  }, TTL)
}

export const ga4Source: AnalyticsSource = {
  async getDashboard(range: DateRange): Promise<AnalyticsDashboard> {
    if (!isAnalyticsConfigured()) return emptyDashboard(range)
    const [visitors, topPages, trafficSources, articleEngagement] = await Promise.all([
      fetchVisitors(range), fetchTopPages(range), fetchTrafficSources(range), fetchArticleEngagement(range),
    ])
    return { range, visitors, topPages, trafficSources, articleEngagement, configured: true }
  },
}
