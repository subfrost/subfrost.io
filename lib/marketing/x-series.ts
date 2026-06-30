// lib/marketing/x-series.ts
import type { XPostMetrics, XPostSnapshotPayload } from "@/lib/marketing/x-types"
import type { SeriesPoint } from "@/lib/marketing/protocol-series"

export interface XPostSnapshotRow {
  id: string
  createdAt: Date
  refUrl: string | null
  payload: XPostSnapshotPayload
}

export function engagementRate(m: XPostMetrics): number | null {
  if (m.impressions === null || m.impressions === 0) return null
  const eng = (m.likes ?? 0) + (m.reposts ?? 0) + (m.replies ?? 0) + (m.quotes ?? 0) + (m.bookmarks ?? 0)
  return eng / m.impressions
}

export interface XPostTableRow {
  tweetId: string
  url: string
  postedAt: string
  text: string
  metrics: XPostMetrics
  engagementRate: number | null
  capturedAt: string
}

export function buildXPostTable(rows: XPostSnapshotRow[]): XPostTableRow[] {
  const latest = new Map<string, XPostSnapshotPayload>()
  for (const r of rows) {
    const p = r.payload
    const prev = latest.get(p.tweetId)
    if (!prev || p.capturedAt > prev.capturedAt) latest.set(p.tweetId, p)
  }
  return [...latest.values()]
    .map((p) => ({
      tweetId: p.tweetId, url: p.url, postedAt: p.postedAt, text: p.text,
      metrics: p.metrics, engagementRate: engagementRate(p.metrics), capturedAt: p.capturedAt,
    }))
    .sort((a, b) => (a.postedAt < b.postedAt ? 1 : a.postedAt > b.postedAt ? -1 : 0))
}

export interface XCurvePoint extends XPostMetrics {
  date: string
}

export function buildXPostCurve(rows: XPostSnapshotRow[], tweetId: string): XCurvePoint[] {
  return rows
    .filter((r) => r.payload.tweetId === tweetId)
    .map((r) => ({ date: r.createdAt.toISOString().slice(0, 10), ...r.payload.metrics }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

type AttrKey = "dieselHolders" | "btcLocked" | "dieselPrice"

export function attributionDelta(series: SeriesPoint[], postDateISO: string, days: number, key: AttrKey): number | null {
  if (series.length === 0) return null
  const s = [...series].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const postDay = postDateISO.slice(0, 10)
  const start = s.find((p) => p.date >= postDay)
  if (!start) return null
  const targetDay = new Date(new Date(`${start.date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
  let end: SeriesPoint | null = null
  for (const p of s) {
    if (p.date <= targetDay) end = p
    else break
  }
  if (!end) return null
  const a = start[key]
  const b = end[key]
  if (a === null || b === null) return null
  return b - a
}

export interface AttributionRow {
  tweetId: string
  url: string
  postedAt: string
  text: string
  engagementRate: number | null
  impressions: number | null
  holders: { d1: number | null; d3: number | null; d7: number | null }
  btcLocked: { d1: number | null; d3: number | null; d7: number | null }
}

export function buildAttributionRows(posts: XPostTableRow[], series: SeriesPoint[]): AttributionRow[] {
  return posts.map((p) => ({
    tweetId: p.tweetId, url: p.url, postedAt: p.postedAt, text: p.text,
    engagementRate: p.engagementRate, impressions: p.metrics.impressions,
    holders: {
      d1: attributionDelta(series, p.postedAt, 1, "dieselHolders"),
      d3: attributionDelta(series, p.postedAt, 3, "dieselHolders"),
      d7: attributionDelta(series, p.postedAt, 7, "dieselHolders"),
    },
    btcLocked: {
      d1: attributionDelta(series, p.postedAt, 1, "btcLocked"),
      d3: attributionDelta(series, p.postedAt, 3, "btcLocked"),
      d7: attributionDelta(series, p.postedAt, 7, "btcLocked"),
    },
  }))
}
