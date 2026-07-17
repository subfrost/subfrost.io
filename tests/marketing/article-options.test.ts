import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({ default: { article: { findMany: vi.fn() } } }))

import { listArticleOptions } from "@/lib/cms/marketing-pushes"
import prisma from "@/lib/prisma"

beforeEach(() => vi.clearAllMocks())

describe("listArticleOptions", () => {
  it("resolves the title by primaryLocale and passes through status", async () => {
    vi.mocked(prisma.article.findMany).mockResolvedValueOnce([
      { id: "a1", status: "PUBLISHED", primaryLocale: "zh", translations: [{ title: "Hello", locale: "en" }, { title: "Ni hao", locale: "zh" }] },
      { id: "a2", status: "DRAFT", primaryLocale: "en", translations: [{ title: "Draft one", locale: "en" }] },
    ] as never)
    const opts = await listArticleOptions()
    expect(opts).toEqual([
      { id: "a1", status: "PUBLISHED", title: "Ni hao" },
      { id: "a2", status: "DRAFT", title: "Draft one" },
    ])
  })

  it("falls back to '(untitled)' when an article has no translations", async () => {
    vi.mocked(prisma.article.findMany).mockResolvedValueOnce([
      { id: "a3", status: "DRAFT", primaryLocale: "en", translations: [] },
    ] as never)
    expect(await listArticleOptions()).toEqual([{ id: "a3", status: "DRAFT", title: "(untitled)" }])
  })
})
