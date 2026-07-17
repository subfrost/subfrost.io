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

// --- fetch functions ---

const API_BASE = "https://api.x.com/2"

export class XApiError extends Error {}

function bearer(): string | null {
  return process.env.X_BEARER_TOKEN || null
}

export function isOlderThan(iso: string, days: number, now = Date.now()): boolean {
  return now - new Date(iso).getTime() > days * 24 * 60 * 60 * 1000
}

export async function resolveAccountId(handle = X_HANDLE): Promise<string> {
  const token = bearer()
  if (!token) throw new XApiError("not_configured")
  const envId = process.env.X_ACCOUNT_ID
  if (envId) return envId
  const res = await fetch(`${API_BASE}/users/by/username/${handle}`, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new XApiError(`users/by/username ${res.status}`)
  const j = (await res.json()) as { data?: { id?: string } }
  const id = j?.data?.id
  if (!id) throw new XApiError("no account id")
  return id
}

export async function fetchRecentPosts(
  accountId: string,
  opts: { sinceDays?: number; maxPages?: number } = {},
): Promise<ApiTweet[]> {
  const token = bearer()
  if (!token) throw new XApiError("not_configured")
  const out: ApiTweet[] = []
  let pagination: string | undefined
  const maxPages = opts.maxPages ?? 50
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${API_BASE}/users/${accountId}/tweets`)
    url.searchParams.set("max_results", "100")
    url.searchParams.set("exclude", "retweets,replies")
    url.searchParams.set("tweet.fields", "public_metrics,created_at,text")
    if (pagination) url.searchParams.set("pagination_token", pagination)
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
    if (!res.ok) throw new XApiError(`users/:id/tweets ${res.status}`)
    const j = (await res.json()) as { data?: ApiTweet[]; meta?: { next_token?: string } }
    const data = j?.data ?? []
    out.push(...data)
    pagination = j?.meta?.next_token
    if (!pagination) break
    if (opts.sinceDays !== undefined) {
      const oldest = data[data.length - 1]
      if (oldest?.created_at && isOlderThan(oldest.created_at, opts.sinceDays)) break
    }
  }
  if (opts.sinceDays !== undefined) {
    return out.filter((t) => t.created_at && !isOlderThan(t.created_at, opts.sinceDays as number))
  }
  return out
}
