import { describe, it, expect, vi, beforeEach } from "vitest"

// /admin/articles/new was the only page under /admin without the auth guard. The
// edge middleware only checks the JWT signature (verifySession) and defers full
// auth to server components, so a signature-valid-but-stale cookie (legacy token,
// bumped tokenVersion, revoked session, pending-2fa) reached this page with
// currentUser() === null and rendered the "New article" editor with no real
// session. It must redirect to login in that case — matching every other /admin
// page. Writes were already gated server-side, but the guard keeps the editor
// from rendering at all for a stale session.

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/components/cms/AdminEditor", () => ({ AdminEditor: () => null }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

import NewArticlePage from "@/app/admin/articles/new/page"
import { currentUser } from "@/lib/cms/authz"
import { redirect } from "next/navigation"

beforeEach(() => vi.clearAllMocks())

describe("new article page auth guard", () => {
  it("redirects to /admin/login when the session resolves to no user (stale cookie)", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(null)

    await expect(NewArticlePage()).rejects.toThrow("NEXT_REDIRECT:/admin/login")
    expect(redirect).toHaveBeenCalledWith("/admin/login")
  })

  it("renders the editor for a logged-in user, passing PUBLISH_ARTICLES privilege through", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce({
      id: "u1",
      email: "a@b.io",
      name: null,
      role: "EDITOR",
      privileges: ["articles.publish"],
    } as never)

    const editor = (await NewArticlePage()) as { props: { canPublish: boolean } }

    expect(redirect).not.toHaveBeenCalled()
    expect(editor.props.canPublish).toBe(true)
  })
})
