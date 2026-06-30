// tests/api/x-cron.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/marketing/x-client", () => ({
  resolveAccountId: vi.fn(),
  fetchRecentPosts: vi.fn(),
  mapApiTweetToPayload: vi.fn(),
  XApiError: class extends Error {},
}))
vi.mock("@/lib/marketing/x-store", () => ({
  createXPostSnapshot: vi.fn(),
  xPostSnapshotExistsOn: vi.fn(),
  updateMatchedPushMetrics: vi.fn(),
}))

import { NextRequest } from "next/server"
import { GET } from "@/app/api/marketing/x-cron/route"
import * as xc from "@/lib/marketing/x-client"
import * as xs from "@/lib/marketing/x-store"

const req = (url = "https://subfrost.io/api/marketing/x-cron", auth?: string) =>
  new NextRequest(url, { method: "GET", headers: auth ? { authorization: auth } : {} })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("PREFETCH_SECRET", "")
  vi.stubEnv("X_BEARER_TOKEN", "tok")
})
afterEach(() => vi.unstubAllEnvs())

describe("GET /api/marketing/x-cron", () => {
  it("degrades to not_configured without X_BEARER_TOKEN", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "")
    const res = await GET(req())
    expect(await res.json()).toEqual({ ok: true, skipped: "not_configured" })
    expect(xc.resolveAccountId).not.toHaveBeenCalled()
  })

  it("401 when PREFETCH_SECRET is set and the bearer is wrong", async () => {
    vi.stubEnv("PREFETCH_SECRET", "s3cr3t")
    const res = await GET(req(undefined, "Bearer nope"))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBeTruthy()
  })

  it("captures new posts, skips existing, and updates matched pushes", async () => {
    vi.mocked(xc.resolveAccountId).mockResolvedValue("acc")
    vi.mocked(xc.fetchRecentPosts).mockResolvedValue([{ id: "1", text: "a" }, { id: "2", text: "b" }] as never)
    vi.mocked(xc.mapApiTweetToPayload).mockImplementation((t: { id: string }) => ({
      capturedAt: "2026-06-30T00:05:00Z", tweetId: t.id, url: `https://x.com/subfrost_news/status/${t.id}`,
      postedAt: "2026-06-29T00:00:00Z", text: "x",
      metrics: { impressions: 1, likes: 1, reposts: 1, replies: 1, quotes: 1, bookmarks: 1 }, partial: false,
    }) as never)
    vi.mocked(xs.xPostSnapshotExistsOn).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    vi.mocked(xs.createXPostSnapshot).mockResolvedValue({ id: "s" } as never)
    vi.mocked(xs.updateMatchedPushMetrics).mockResolvedValue(1)

    const res = await GET(req())
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, captured: 1, skipped: 1, failed: 0, pushesUpdated: 1, backfill: false })
    expect(xs.createXPostSnapshot).toHaveBeenCalledTimes(1)
  })

  it("passes no window on backfill=1", async () => {
    vi.mocked(xc.resolveAccountId).mockResolvedValue("acc")
    vi.mocked(xc.fetchRecentPosts).mockResolvedValue([])
    vi.mocked(xs.updateMatchedPushMetrics).mockResolvedValue(0)
    await GET(req("https://subfrost.io/api/marketing/x-cron?backfill=1"))
    expect(vi.mocked(xc.fetchRecentPosts).mock.calls[0][1]).toEqual({})
  })

  it("returns 500 on an X API error", async () => {
    vi.mocked(xc.resolveAccountId).mockRejectedValue(new xc.XApiError("boom"))
    const res = await GET(req())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBeTruthy()
  })

  it("degrades to pushesUpdated:0 when updateMatchedPushMetrics fails, still 200 with captured count", async () => {
    vi.mocked(xc.resolveAccountId).mockResolvedValue("acc")
    vi.mocked(xc.fetchRecentPosts).mockResolvedValue([{ id: "1", text: "a" }, { id: "2", text: "b" }] as never)
    vi.mocked(xc.mapApiTweetToPayload).mockImplementation((t: { id: string }) => ({
      capturedAt: "2026-06-30T00:05:00Z", tweetId: t.id, url: `https://x.com/subfrost_news/status/${t.id}`,
      postedAt: "2026-06-29T00:00:00Z", text: "x",
      metrics: { impressions: 1, likes: 1, reposts: 1, replies: 1, quotes: 1, bookmarks: 1 }, partial: false,
    }) as never)
    vi.mocked(xs.xPostSnapshotExistsOn).mockResolvedValue(false)
    vi.mocked(xs.createXPostSnapshot).mockResolvedValue({ id: "s" } as never)
    vi.mocked(xs.updateMatchedPushMetrics).mockRejectedValue(new Error("db down"))

    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.pushesUpdated).toBe(0)
    expect(body.captured).toBe(2)
  })
})
