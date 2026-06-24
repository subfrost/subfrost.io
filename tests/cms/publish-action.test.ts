import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/cms/article-write", () => ({ upsertArticle: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  default: { article: { findUnique: vi.fn() }, articleTranslation: { findMany: vi.fn() } },
}))

import { publishArticleAction } from "@/actions/cms/articles"
import { currentUser } from "@/lib/cms/authz"
import { upsertArticle } from "@/lib/cms/article-write"
import prisma from "@/lib/prisma"

const asUser = (privileges: string[]) =>
  ({ id: "u1", email: "a@b.io", name: null, role: "EDITOR", privileges }) as never
const fn = (m: unknown) => vi.mocked(m as never as ReturnType<typeof vi.fn>)

beforeEach(() => vi.clearAllMocks())

describe("publishArticleAction", () => {
  it("requires authentication", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(null)
    expect((await publishArticleAction("a1")).ok).toBe(false)
  })

  it("publishes via upsertArticle keeping the slug", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(["articles.publish"]))
    fn(prisma.article.findUnique).mockResolvedValueOnce({
      id: "a1", slug: "my-post", coverImage: null, featured: false, primaryLocale: "en", authorId: "u1", tags: [],
    })
    fn(prisma.articleTranslation.findMany).mockResolvedValueOnce([{ locale: "en", title: "T", excerpt: "", body: "B" }])
    fn(upsertArticle).mockResolvedValueOnce({ ok: true, slug: "my-post", id: "a1" })
    const res = await publishArticleAction("a1")
    expect(res.ok).toBe(true)
    const arg = vi.mocked(upsertArticle).mock.calls[0][1] as { id: string; status: string; slug?: string }
    expect(arg.id).toBe("a1")
    expect(arg.status).toBe("PUBLISHED")
    expect(arg.slug).toBe("my-post")
  })

  it("preserves sources when publishing from preview", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(["articles.publish"]))
    fn(prisma.article.findUnique).mockResolvedValueOnce({
      id: "a1", slug: "my-post", coverImage: null, featured: false, primaryLocale: "en", authorId: "u1", tags: [],
    })
    fn(prisma.articleTranslation.findMany).mockResolvedValueOnce([{ locale: "en", title: "T", excerpt: "", body: "B", sources: "BBSW #29" }])
    fn(upsertArticle).mockResolvedValueOnce({ ok: true, slug: "my-post", id: "a1" })
    await publishArticleAction("a1")
    const arg = vi.mocked(upsertArticle).mock.calls[0][1] as { translations: { en?: { sources?: string } } }
    expect(arg.translations.en?.sources).toBe("BBSW #29")
  })
})
