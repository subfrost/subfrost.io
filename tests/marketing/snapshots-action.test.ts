import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/lib/cms/audit", () => ({ audit: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }))
vi.mock("@/lib/marketing/snapshot", () => ({ captureSnapshot: vi.fn() }))
vi.mock("@/lib/marketing/snapshot-store", () => ({ createSnapshot: vi.fn(), deleteSnapshot: vi.fn() }))

import { captureSnapshotAction, liveSnapshotAction } from "@/actions/marketing/snapshots"
import { currentUser } from "@/lib/cms/authz"
import { captureSnapshot } from "@/lib/marketing/snapshot"
import { createSnapshot } from "@/lib/marketing/snapshot-store"

const payload = { capturedAt: "t", partial: false } as never
beforeEach(() => vi.clearAllMocks())

it("rejects when the user lacks marketing.view", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: [] } as never)
  const r = await captureSnapshotAction({ label: "x", context: "GENERAL" })
  expect(r).toEqual({ ok: false, error: "unauthorized" })
  expect(createSnapshot).not.toHaveBeenCalled()
})

it("captures + persists for an authorized user", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["marketing.view"] } as never)
  vi.mocked(captureSnapshot).mockResolvedValue(payload)
  vi.mocked(createSnapshot).mockResolvedValue({ id: "s1" } as never)
  const r = await captureSnapshotAction({ label: "before X", context: "X_POST", refUrl: "https://x.com/p" })
  expect(r).toEqual({ ok: true, value: { id: "s1" } })
  expect(createSnapshot).toHaveBeenCalledWith(
    { label: "before X", context: "X_POST", refUrl: "https://x.com/p", articleId: null, note: null },
    payload, "u1",
  )
})

it("liveSnapshotAction returns the payload without persisting", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["marketing.view"] } as never)
  vi.mocked(captureSnapshot).mockResolvedValue(payload)
  const r = await liveSnapshotAction()
  expect(r).toEqual({ ok: true, value: payload })
  expect(createSnapshot).not.toHaveBeenCalled()
})
