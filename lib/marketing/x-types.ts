// lib/marketing/x-types.ts
export interface XPostMetrics {
  impressions: number | null
  likes: number | null
  reposts: number | null
  replies: number | null
  quotes: number | null
  bookmarks: number | null
}

export interface XPostSnapshotPayload {
  capturedAt: string
  tweetId: string
  url: string
  postedAt: string
  text: string
  metrics: XPostMetrics
  partial: boolean
}
