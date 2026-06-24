import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  default: { article: { findUnique: vi.fn(), create: vi.fn() } },
}))

import { upsertArticle } from "@/lib/cms/article-write"
import prisma from "@/lib/prisma"

const fn = (m: unknown) => vi.mocked(m as never as ReturnType<typeof vi.fn>)
beforeEach(() => vi.clearAllMocks())

describe("upsertArticle — sources", () => {
  it("persists sources on create", async () => {
    fn(prisma.article.findUnique).mockResolvedValue(null)
    fn(prisma.article.create).mockResolvedValue({ id: "a1", slug: "title" })
    const res = await upsertArticle(
      { id: "u1", privileges: ["articles.publish"] },
      { translations: { en: { title: "Title", excerpt: "", body: "Body", sources: "BBSW #29" } } },
    )
    expect(res.ok).toBe(true)
    const arg = vi.mocked(prisma.article.create).mock.calls[0][0] as { data: { translations: { create: { sources: string }[] } } }
    expect(arg.data.translations.create[0].sources).toBe("BBSW #29")
  })
})
