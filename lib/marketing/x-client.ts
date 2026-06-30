// lib/marketing/x-client.ts
import type { XPostMetrics, XPostSnapshotPayload } from "@/lib/marketing/x-types"

export const X_HANDLE = "subfrost_news"

export interface ApiTweet {
  id: string
  text: string
  created_at?: string
  public_metrics?: {
    impression_count?: number
    like_count?: number
    retweet_count?: number
    reply_count?: number
    quote_count?: number
    bookmark_count?: number
  }
}

export function extractTweetId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i)
  return m ? m[1] : null
}

const n = (v: number | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

export function mapApiTweetToPayload(t: ApiTweet, capturedAt: string, handle = X_HANDLE): XPostSnapshotPayload {
  const pm = t.public_metrics ?? {}
  const metrics: XPostMetrics = {
    impressions: n(pm.impression_count),
    likes: n(pm.like_count),
    reposts: n(pm.retweet_count),
    replies: n(pm.reply_count),
    quotes: n(pm.quote_count),
    bookmarks: n(pm.bookmark_count),
  }
  const partial = Object.values(metrics).some((v) => v === null) || !t.created_at
  return {
    capturedAt,
    tweetId: t.id,
    url: `https://x.com/${handle}/status/${t.id}`,
    postedAt: t.created_at ?? "",
    text: (t.text ?? "").slice(0, 280),
    metrics,
    partial,
  }
}
