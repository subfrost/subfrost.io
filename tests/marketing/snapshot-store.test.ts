import { describe, it, expect, vi, beforeEach } from "vitest"

const client = vi.hoisted(() => ({
  marketingSnapshot: {
    create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn(),
  },
}))
vi.mock("@/lib/prisma", () => ({ prisma: client, default: client }))

import { createSnapshot, listSnapshots, MarketingError } from "@/lib/marketing/snapshot-store"
import type { SnapshotPayload } from "@/lib/marketing/types"

const payload = { capturedAt: "t", partial: false, protocol: {} as never, tokens: {} as never, ratios: {} as never } as SnapshotPayload

beforeEach(() => vi.clearAllMocks())

it("rejects an empty label", async () => {
  await expect(createSnapshot({ label: "  ", context: "GENERAL", refUrl: null, articleId: null, note: null }, payload, "u1"))
    .rejects.toBeInstanceOf(MarketingError)
})

it("creates a row and maps creator/article names", async () => {
  client.marketingSnapshot.create.mockResolvedValue({
    id: "s1", createdAt: new Date("2026-06-24"), label: "before X", context: "X_POST",
    refUrl: "https://x.com/p", articleId: null, note: null, payload,
    createdBy: { name: "Vitor" }, article: null,
  })
  const row = await createSnapshot({ label: "before X", context: "X_POST", refUrl: "https://x.com/p", articleId: null, note: null }, payload, "u1")
  expect(row.id).toBe("s1")
  expect(row.context).toBe("X_POST")
  expect(row.createdByName).toBe("Vitor")
  expect(client.marketingSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ label: "before X", createdById: "u1" }),
  }))
})

it("lists snapshots newest-first", async () => {
  client.marketingSnapshot.findMany.mockResolvedValue([])
  await listSnapshots()
  expect(client.marketingSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({
    orderBy: { createdAt: "desc" },
  }))
})
