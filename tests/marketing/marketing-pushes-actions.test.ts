import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  default: {
    marketingPush: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
    recurringPush: { findUnique: vi.fn() },
  },
}))

import { savePush, materializeRecurrence } from "@/actions/cms/marketing-pushes"
import { currentUser } from "@/lib/cms/authz"
import prisma from "@/lib/prisma"

const asUser = (privileges: string[]) => vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges } as never)

beforeEach(() => vi.clearAllMocks())

describe("savePush", () => {
  it("rejects without marketing.view", async () => {
    asUser([])
    expect(await savePush({ title: "x", channel: "X", status: "IDEA" })).toEqual({ ok: false, error: "Not allowed" })
    expect(prisma.marketingPush.create).not.toHaveBeenCalled()
  })

  it("creates a push for an authorized user", async () => {
    asUser(["marketing.view"])
    vi.mocked(prisma.marketingPush.create).mockResolvedValueOnce({ id: "p1" } as never)
    const res = await savePush({ title: "Thread", channel: "X", status: "SCHEDULED", scheduledFor: "2026-07-02" })
    expect(res).toEqual({ ok: true, id: "p1" })
  })
})

describe("materializeRecurrence", () => {
  it("returns the existing instance instead of duplicating", async () => {
    asUser(["marketing.view"])
    vi.mocked(prisma.recurringPush.findUnique).mockResolvedValueOnce({ id: "r1", title: "Weekly report", channel: "ARTICLE" } as never)
    vi.mocked(prisma.marketingPush.findUnique).mockResolvedValueOnce({ id: "existing" } as never)
    const res = await materializeRecurrence("r1", "2026-07-03")
    expect(res).toEqual({ ok: true, id: "existing" })
    expect(prisma.marketingPush.create).not.toHaveBeenCalled()
  })
})
