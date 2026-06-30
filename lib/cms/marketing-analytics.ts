import type { PushChannel } from "@prisma/client"
import type { ArticleEngagementRow } from "@/lib/analytics/source"

export interface PushMetrics {
  impressions?: number | null
  likes?: number | null
  reposts?: number | null
  clicks?: number | null
}

export interface PushAnalytics {
  source: "ga4" | "manual" | "none"
  pageViews: number | null
  avgEngagementSeconds: number | null
  impressions: number | null
  likes: number | null
  reposts: number | null
  clicks: number | null
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

export function resolvePushAnalytics(
  push: { channel: PushChannel; articleSlug: string | null; metrics: PushMetrics | null },
  ga4Rows: ArticleEngagementRow[],
): PushAnalytics {
  const m = push.metrics ?? {}
  const manual = {
    impressions: num(m.impressions),
    likes: num(m.likes),
    reposts: num(m.reposts),
    clicks: num(m.clicks),
  }
  const hasManual = Object.values(manual).some((v) => v !== null)

  if (push.channel === "ARTICLE" && push.articleSlug) {
    const row = ga4Rows.find((r) => r.slug === push.articleSlug)
    if (row) {
      return { source: "ga4", pageViews: num(row.pageViews), avgEngagementSeconds: num(row.avgEngagementSeconds), ...manual }
    }
  }
  if (hasManual) return { source: "manual", pageViews: null, avgEngagementSeconds: null, ...manual }
  return { source: "none", pageViews: null, avgEngagementSeconds: null, impressions: null, likes: null, reposts: null, clicks: null }
}
