import { describe, it, expect, vi, beforeEach } from "vitest"

// The dashboard is the default /admin landing. The edge middleware only checks
// the JWT signature (verifySession) and defers full auth to server components,
// so a request carrying a signature-valid-but-stale cookie (legacy token without
// jti, bumped tokenVersion, revoked session, or a pending-2fa token) reaches this
// page with currentUser() === null. The page must redirect to login in that case,
// never dereference a null user — regression test for the prod "Application error"
// (digest 2108926570: "Cannot read properties of null (reading 'id')").

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ default: { article: { findMany: vi.fn() } } }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

import AdminDashboard from "@/app/admin/page"
import ArticlesList from "@/app/admin/articles/page"
import { currentUser } from "@/lib/cms/authz"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"

beforeEach(() => vi.clearAllMocks())

describe("admin dashboard auth guard", () => {
  it("redirects to /admin/login when the session resolves to no user (stale cookie)", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(null)

    await expect(AdminDashboard()).rejects.toThrow("NEXT_REDIRECT:/admin/login")
    expect(redirect).toHaveBeenCalledWith("/admin/login")
    expect(prisma.article.findMany).not.toHaveBeenCalled()
  })

  it("lists the author's own articles for a non-privileged user (on /admin/articles)", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce({
      id: "u1",
      email: "a@b.io",
      name: null,
      role: "AUTHOR",
      privileges: [],
    } as never)
    vi.mocked(prisma.article.findMany as never as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])

    await ArticlesList()

    expect(redirect).not.toHaveBeenCalled()
    expect(prisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { authorId: "u1" } }),
    )
  })
})
