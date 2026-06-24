// Normalized analytics shapes + the source boundary. GA4 is the first adapter
// (lib/analytics/ga4.ts); an Elasticsearch adapter can implement the same
// AnalyticsSource later without touching the UI.

export interface DateRange { start: string; end: string; preset: string }

export interface VisitorPoint { date: string; activeUsers: number; sessions: number; pageViews: number }
export interface VisitorsSeries {
  points: VisitorPoint[]
  totals: { activeUsers: number; sessions: number; pageViews: number }
}
export interface TopPageRow { path: string; title: string | null; pageViews: number }
export interface TrafficSourceRow { channel: string; source: string | null; campaign: string | null; sessions: number }
export interface ArticleEngagementRow {
  slug: string; title: string | null; path: string; pageViews: number; avgEngagementSeconds: number | null
}

export interface AnalyticsDashboard {
  range: DateRange
  visitors: VisitorsSeries
  topPages: TopPageRow[]
  trafficSources: TrafficSourceRow[]
  articleEngagement: ArticleEngagementRow[]
  configured: boolean
}

export interface AnalyticsSource {
  getDashboard(range: DateRange): Promise<AnalyticsDashboard>
}

/** GA4 is configured only when both env vars are present. */
export function isAnalyticsConfigured(): boolean {
  return Boolean(process.env.GA4_PROPERTY_ID && process.env.GA_SERVICE_ACCOUNT_JSON)
}

/** A fully-empty dashboard (used when unconfigured or on total failure). */
export function emptyDashboard(range: DateRange): AnalyticsDashboard {
  return {
    range,
    visitors: { points: [], totals: { activeUsers: 0, sessions: 0, pageViews: 0 } },
    topPages: [],
    trafficSources: [],
    articleEngagement: [],
    configured: isAnalyticsConfigured(),
  }
}
