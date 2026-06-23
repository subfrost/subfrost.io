import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/lib/cms/translate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cms/translate")>()
  return { ...actual, translate: vi.fn(), translationUnavailable: vi.fn() }
})
vi.mock("@/lib/prisma", () => ({
  default: {
    article: { findUnique: vi.fn() },
    articleTranslation: { findUnique: vi.fn(), upsert: vi.fn() },
    revision: { create: vi.fn() },
  },
}))

import { translateArticleAction } from "@/actions/cms/articles"
import { currentUser } from "@/lib/cms/authz"
import { translate, translationUnavailable } from "@/lib/cms/translate"
import prisma from "@/lib/prisma"

const asUser = (privileges: string[], id = "u1") =>
  ({ id, email: "a@b.io", name: null, role: "AUTHOR", privileges }) as never

beforeEach(() => vi.clearAllMocks())

describe("translateArticleAction", () => {
  it("rejects a caller without articles.write", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser([]))
    const res = await translateArticleAction("a1", "en", "zh")
    expect(res.ok).toBe(false)
    expect(translate).not.toHaveBeenCalled()
  })

  it("returns unavailable when no API key (no SDK call)", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(["articles.write"]))
    vi.mocked(prisma.article.findUnique as never as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "a1", authorId: "u1" })
    vi.mocked(translationUnavailable).mockReturnValueOnce(true)
    const res = await translateArticleAction("a1", "en", "zh")
    expect(res).toMatchObject({ ok: false, unavailable: true })
    expect(translate).not.toHaveBeenCalled()
  })

  it("translates and persists the target locale + a revision", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(["articles.write"]))
    vi.mocked(prisma.article.findUnique as never as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "a1", authorId: "u1" })
    vi.mocked(translationUnavailable).mockReturnValueOnce(false)
    vi.mocked(prisma.articleTranslation.findUnique as never as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ title: "Hi", excerpt: "x", body: "# H" })
    vi.mocked(translate).mockResolvedValueOnce({ title: "你好", excerpt: "x", body: "# H" })
    const res = await translateArticleAction("a1", "en", "zh")
    expect(res.ok).toBe(true)
    expect(prisma.articleTranslation.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.revision.create).toHaveBeenCalledTimes(1)
    if (res.ok) expect(res.translation.title).toBe("你好")
  })
})
