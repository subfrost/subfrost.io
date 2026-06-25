import { describe, it, expect, vi, beforeEach } from "vitest"

const tx = {
  article: { update: vi.fn() },
  articleTranslation: { deleteMany: vi.fn(), upsert: vi.fn() },
  revision: { create: vi.fn() },
}

vi.mock("@/lib/prisma", () => {
  const article = { findUnique: vi.fn(), create: vi.fn() }
  const user = { findMany: vi.fn() }
  const client = { article, user, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) }
  return { prisma: client, default: client }
})
vi.mock("@/lib/cms/article-notify", () => ({ notifyNewArticle: vi.fn() }))

import prisma from "@/lib/prisma"
import { upsertArticle } from "@/lib/cms/article-write"

const p = prisma as unknown as {
  article: Record<string, ReturnType<typeof vi.fn>>
  user: { findMany: ReturnType<typeof vi.fn> }
  $transaction: ReturnType<typeof vi.fn>
}
const actor = { id: "auth1", privileges: ["articles.publish", "articles.edit_any"] as never }
const input = (over: Record<string, unknown> = {}) => ({
  translations: { en: { title: "T", excerpt: "E", body: "B", sources: "" } }, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  tx.article.update.mockResolvedValue({})
  tx.articleTranslation.deleteMany.mockResolvedValue({})
  tx.articleTranslation.upsert.mockResolvedValue({})
  tx.revision.create.mockResolvedValue({})
  p.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx))
})

describe("upsertArticle — coAuthors", () => {
  it("connects validated coAuthors on create, dropping the author and unknown ids", async () => {
    p.user.findMany.mockResolvedValue([{ id: "u2" }, { id: "u3" }]) // u9 unknown, auth1 is the author
    p.article.create.mockResolvedValue({ id: "new1", slug: "t" })
    await upsertArticle(actor, input({ coAuthorIds: ["u2", "u3", "u2", "auth1", "u9"] }))
    const arg = p.article.create.mock.calls[0][0] as { data: { coAuthors: { connect: { id: string }[] } } }
    expect(arg.data.coAuthors.connect.map((c) => c.id).sort()).toEqual(["u2", "u3"])
  })

  it("sets coAuthors on update", async () => {
    p.user.findMany.mockResolvedValue([{ id: "u2" }])
    p.article.findUnique.mockResolvedValueOnce({ id: "a1", slug: "s", status: "DRAFT", authorId: "auth1", publishedAt: null })
    await upsertArticle(actor, input({ id: "a1", coAuthorIds: ["u2"] }))
    const arg = tx.article.update.mock.calls[0][0] as { data: { coAuthors: { set: { id: string }[] } } }
    expect(arg.data.coAuthors.set).toEqual([{ id: "u2" }])
  })

  it("connects an empty set when no coAuthorIds are given", async () => {
    p.article.create.mockResolvedValue({ id: "new1", slug: "t" })
    await upsertArticle(actor, input())
    const arg = p.article.create.mock.calls[0][0] as { data: { coAuthors: { connect: { id: string }[] } } }
    expect(arg.data.coAuthors.connect).toEqual([])
    expect(p.user.findMany).not.toHaveBeenCalled()
  })
})
