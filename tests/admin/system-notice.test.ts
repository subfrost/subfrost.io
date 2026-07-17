import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  default: { systemNotice: { findUnique: vi.fn(), upsert: vi.fn() } },
}))
vi.mock("@/lib/cms/translate", () => ({
  translate: vi.fn(),
  translationUnavailable: vi.fn(() => false),
}))

import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { translate, translationUnavailable } from "@/lib/cms/translate"
import { getSystemNotice } from "@/lib/cms/system-notice"
import { setSystemNotice, translateNoticeAction } from "@/actions/admin/system-notice"

const editor = { id: "u1", privileges: ["system.view", "system.edit"] }
const viewer = { id: "u2", privileges: ["system.view"] }

beforeEach(() => vi.clearAllMocks())

describe("getSystemNotice", () => {
  it("returns the off-default when no row exists", async () => {
    vi.mocked(prisma.systemNotice.findUnique).mockResolvedValue(null as never)
    const dto = await getSystemNotice()
    expect(dto).toMatchObject({ enabled: false, showBanner: true, showModal: true, titleEn: "", titleZh: "" })
  })
})

describe("setSystemNotice", () => {
  const input = { enabled: true, showBanner: true, showModal: false, titleEn: "T", messageEn: "M", titleZh: "", messageZh: "" }

  it("requires system.edit", async () => {
    vi.mocked(currentUser).mockResolvedValue(viewer as never)
    const res = await setSystemNotice(input)
    expect(res.ok).toBe(false)
    expect(prisma.systemNotice.upsert).not.toHaveBeenCalled()
  })

  it("upserts the singleton row and stamps updatedBy", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    vi.mocked(prisma.systemNotice.upsert).mockResolvedValue({} as never)
    const res = await setSystemNotice(input)
    expect(res.ok).toBe(true)
    const arg = vi.mocked(prisma.systemNotice.upsert).mock.calls[0][0]
    expect(arg.where).toEqual({ id: 1 })
    expect(arg.update).toMatchObject({ enabled: true, showModal: false, titleEn: "T", titleZh: null, updatedBy: "u1" })
  })
})

describe("translateNoticeAction", () => {
  it("blocks non-editors", async () => {
    vi.mocked(currentUser).mockResolvedValue(viewer as never)
    expect((await translateNoticeAction({ titleEn: "Hi", messageEn: "There" })).ok).toBe(false)
  })

  it("maps title->title and message->body", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    vi.mocked(translationUnavailable).mockReturnValue(false)
    vi.mocked(translate).mockResolvedValue({ title: "标题", excerpt: "", body: "正文", sources: "" } as never)
    const res = await translateNoticeAction({ titleEn: "Title", messageEn: "Body" })
    expect(res).toEqual({ ok: true, titleZh: "标题", messageZh: "正文" })
    expect(translate).toHaveBeenCalledWith({ title: "Title", excerpt: "", body: "Body", sources: "" }, "en", "zh")
  })

  it("reports when the translator is unavailable", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    vi.mocked(translationUnavailable).mockReturnValue(true)
    const res = await translateNoticeAction({ titleEn: "Title", messageEn: "" })
    expect(res).toEqual({ ok: false, error: expect.any(String), unavailable: true })
  })
})
