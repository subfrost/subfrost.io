// app/api/marketing/x-cron/route.ts
import { NextRequest, NextResponse } from "next/server"
import { resolveAccountId, fetchRecentPosts, mapApiTweetToPayload, XApiError } from "@/lib/marketing/x-client"
import { createXPostSnapshot, xPostSnapshotExistsOn, updateMatchedPushMetrics } from "@/lib/marketing/x-store"
import type { XPostMetrics } from "@/lib/marketing/x-types"

export const dynamic = "force-dynamic"

const WINDOW_DAYS = 7

export async function GET(request: NextRequest) {
  const secret = process.env.PREFETCH_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }
  if (!process.env.X_BEARER_TOKEN) {
    return NextResponse.json({ ok: true, skipped: "not_configured" })
  }

  const backfill = request.nextUrl.searchParams.get("backfill") === "1"
  const now = new Date()
  const capturedAt = now.toISOString()

  try {
    const accountId = await resolveAccountId()
    const tweets = await fetchRecentPosts(accountId, backfill ? {} : { sinceDays: WINDOW_DAYS })
    let captured = 0
    let skipped = 0
    let failed = 0
    const latest = new Map<string, XPostMetrics>()
    for (const t of tweets) {
      try {
        const payload = mapApiTweetToPayload(t, capturedAt)
        latest.set(payload.tweetId, payload.metrics)
        if (await xPostSnapshotExistsOn(payload.url, now)) {
          skipped++
          continue
        }
        await createXPostSnapshot(payload)
        captured++
      } catch {
        failed++
      }
    }
    const pushesUpdated = await updateMatchedPushMetrics(latest)
    return NextResponse.json({ ok: true, captured, skipped, failed, pushesUpdated, backfill })
  } catch (err) {
    const code = err instanceof XApiError ? err.message : String(err)
    return NextResponse.json({ ok: false, error: code }, { status: 500 })
  }
}
