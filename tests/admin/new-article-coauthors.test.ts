import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/components/cms/AdminEditor", () => ({ AdminEditor: () => null }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((u: string) => {
    throw new Error(`NEXT_REDIRECT:${u}`)
  }),
}))
vi.mock("@/lib/prisma", () => ({ default: { user: { findMany: vi.fn() } } }))

import NewArticlePage from "@/app/admin/articles/new/page"
import { currentUser } from "@/lib/cms/authz"
import prisma from "@/lib/prisma"

const fn = (m: unknown) => vi.mocked(m as never as ReturnType<typeof vi.fn>)
beforeEach(() => vi.clearAllMocks())

describe("new article page — co-author options", () => {
  it("passes active members (minus self) as co-author options", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce({
      id: "u1", email: "a@b.io", name: "Vitor", role: "EDITOR", privileges: ["articles.publish"],
    } as never)
    fn(prisma.user.findMany).mockResolvedValue([{ id: "u2", name: "Gabe", email: "g@b.io" }])
    const editor = (await NewArticlePage()) as { props: { members: { id: string; name: string }[] } }
    expect(editor.props.members).toEqual([{ id: "u2", name: "Gabe" }])
  })
})
