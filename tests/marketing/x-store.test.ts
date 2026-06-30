// tests/marketing/x-store.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  default: {
    marketingSnapshot: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    marketingPush: { findMany: vi.fn(), update: vi.fn() },
  },
}))

import { createXPostSnapshot, xPostSnapshotExistsOn, listXPostSnapshots, updateMatchedPushMetrics } from "@/lib/marketing/x-store"
import type { XPostSnapshotPayload, XPostMetrics } from "@/lib/marketing/x-types"
import prisma from "@/lib/prisma"

const metrics: XPostMetrics = { impressions: 1000, likes: 10, reposts: 3, replies: 2, quotes: 1, bookmarks: 4 }
const payload: XPostSnapshotPayload = {
  capturedAt: "2026-06-30T00:05:00.000Z", tweetId: "999",
  url: "https://x.com/subfrost_news/status/999", postedAt: "2026-06-29T12:00:00Z",
  text: "gm", metrics, partial: false,
}

beforeEach(() => vi.clearAllMocks())

describe("createXPostSnapshot", () => {
  it("writes a MarketingSnapshot row with context X_POST and refUrl=url", async () => {
    vi.mocked(prisma.marketingSnapshot.create).mockResolvedValueOnce({ id: "s1", createdAt: new Date("2026-06-30T00:05:00Z"), refUrl: payload.url, payload } as never)
    const row = await createXPostSnapshot(payload)
    expect(row.id).toBe("s1")
    const arg = vi.mocked(prisma.marketingSnapshot.create).mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data.context).toBe("X_POST")
    expect(arg.data.refUrl).toBe(payload.url)
    expect(arg.data.label).toContain("999")
  })
})

describe("xPostSnapshotExistsOn", () => {
  it("queries by context, refUrl and the UTC day window", async () => {
    vi.mocked(prisma.marketingSnapshot.findFirst).mockResolvedValueOnce({ id: "x" } as never)
    const exists = await xPostSnapshotExistsOn(payload.url, new Date("2026-06-30T18:00:00Z"))
    expect(exists).toBe(true)
    const where = (vi.mocked(prisma.marketingSnapshot.findFirst).mock.calls[0][0] as { where: Record<string, unknown> }).where
    expect(where.context).toBe("X_POST")
    expect(where.refUrl).toBe(payload.url)
    expect(where.createdAt).toMatchObject({ gte: new Date("2026-06-30T00:00:00Z"), lt: new Date("2026-07-01T00:00:00Z") })
  })
  it("returns false when none found", async () => {
    vi.mocked(prisma.marketingSnapshot.findFirst).mockResolvedValueOnce(null as never)
    expect(await xPostSnapshotExistsOn(payload.url, new Date("2026-06-30T00:00:00Z"))).toBe(false)
  })
})

describe("updateMatchedPushMetrics", () => {
  it("updates only X pushes whose refUrl tweetId is in the map", async () => {
    vi.mocked(prisma.marketingPush.findMany).mockResolvedValueOnce([
      { id: "p1", refUrl: "https://x.com/subfrost_news/status/999" },
      { id: "p2", refUrl: "https://x.com/subfrost_news/status/777" }, // not in map
      { id: "p3", refUrl: "https://example.com/not-a-tweet" },
    ] as never)
    const count = await updateMatchedPushMetrics(new Map([["999", metrics]]))
    expect(count).toBe(1)
    expect(prisma.marketingPush.update).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(prisma.marketingPush.update).mock.calls[0][0] as { where: { id: string }; data: { metrics: Record<string, unknown> } }
    expect(arg.where.id).toBe("p1")
    expect(arg.data.metrics).toMatchObject({ impressions: 1000, likes: 10, reposts: 3, clicks: null })
  })
})

describe("listXPostSnapshots", () => {
  it("filters by context X_POST ascending", async () => {
    vi.mocked(prisma.marketingSnapshot.findMany).mockResolvedValueOnce([{ id: "s1", createdAt: new Date(), refUrl: payload.url, payload }] as never)
    const rows = await listXPostSnapshots()
    expect(rows).toHaveLength(1)
    const arg = vi.mocked(prisma.marketingSnapshot.findMany).mock.calls[0][0] as { where: Record<string, unknown>; orderBy: Record<string, unknown> }
    expect(arg.where.context).toBe("X_POST")
    expect(arg.orderBy).toMatchObject({ createdAt: "asc" })
  })
})
