import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  default: { marketingSnapshot: { findMany: vi.fn(), findFirst: vi.fn() } },
}))

import { listDailySnapshots, dailySnapshotExistsOn } from "@/lib/marketing/snapshot-store"
import prisma from "@/lib/prisma"

beforeEach(() => vi.clearAllMocks())

const dbRow = (id: string, createdAt: string) => ({
  id, createdAt: new Date(createdAt), label: "Daily", context: "DAILY",
  refUrl: null, articleId: null, note: null, payload: {}, createdBy: null, article: null,
})

describe("listDailySnapshots", () => {
  it("queries DAILY rows ordered by createdAt asc and maps them", async () => {
    vi.mocked(prisma.marketingSnapshot.findMany).mockResolvedValueOnce([dbRow("s1", "2026-06-29T00:05:00Z")] as never)
    const rows = await listDailySnapshots()
    expect(prisma.marketingSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { context: "DAILY" }, orderBy: { createdAt: "asc" } }),
    )
    expect(rows[0].id).toBe("s1")
    expect(rows[0].context).toBe("DAILY")
  })
})

describe("dailySnapshotExistsOn", () => {
  it("returns true when a DAILY row exists within the UTC day", async () => {
    vi.mocked(prisma.marketingSnapshot.findFirst).mockResolvedValueOnce({ id: "x" } as never)
    const got = await dailySnapshotExistsOn(new Date("2026-06-30T23:00:00Z"))
    expect(got).toBe(true)
    const arg = vi.mocked(prisma.marketingSnapshot.findFirst).mock.calls[0][0] as { where: { createdAt: { gte: Date; lt: Date } } }
    expect(arg.where.createdAt.gte.toISOString()).toBe("2026-06-30T00:00:00.000Z")
    expect(arg.where.createdAt.lt.toISOString()).toBe("2026-07-01T00:00:00.000Z")
  })
  it("returns false when none exists", async () => {
    vi.mocked(prisma.marketingSnapshot.findFirst).mockResolvedValueOnce(null as never)
    expect(await dailySnapshotExistsOn(new Date("2026-06-30T12:00:00Z"))).toBe(false)
  })
})
