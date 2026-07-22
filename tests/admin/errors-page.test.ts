import { describe, it, expect, vi, beforeEach } from "vitest"

// /admin/errors is gated by errors.view and reads its data through
// lib/error-reports (server-to-server proxy to subfrost-app). Same guard
// conventions as the dashboard-page test: currentUser() === null must
// redirect to login BEFORE any data fetch, and a user without the privilege
// bounces to /admin.

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
vi.mock("@/lib/error-reports", () => ({ fetchErrorReports: vi.fn() }))

import ErrorsPage from "@/app/admin/errors/page"
import { currentUser } from "@/lib/cms/authz"
import { fetchErrorReports } from "@/lib/error-reports"
import { redirect } from "next/navigation"

const PRIVILEGED = {
  id: "u1",
  email: "ops@subfrost.io",
  name: null,
  role: "ADMIN",
  privileges: ["errors.view"],
} as never

beforeEach(() => vi.clearAllMocks())

describe("/admin/errors auth guard", () => {
  it("redirects to /admin/login when there is no user", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(null)

    await expect(ErrorsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_REDIRECT:/admin/login",
    )
    expect(fetchErrorReports).not.toHaveBeenCalled()
  })

  it("redirects to /admin when the user lacks errors.view", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce({
      id: "u2",
      email: "staff@subfrost.io",
      name: null,
      role: "STAFF",
      privileges: [],
    } as never)

    await expect(ErrorsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_REDIRECT:/admin",
    )
    expect(fetchErrorReports).not.toHaveBeenCalled()
  })
})

describe("/admin/errors data flow", () => {
  it("queries the grouped view with the default 7d window", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(PRIVILEGED)
    vi.mocked(fetchErrorReports).mockResolvedValueOnce({
      configured: true,
      ok: true,
      groups: [],
      pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
    })

    await ErrorsPage({ searchParams: Promise.resolve({}) })

    expect(redirect).not.toHaveBeenCalled()
    const query = vi.mocked(fetchErrorReports).mock.calls[0][0]
    expect(query.view).toBe("grouped")
    expect(query.sortBy).toBe("lastSeen")
    expect(query.since).toBeTruthy()
    expect(query.fingerprint).toBeUndefined()
  })

  it("a fingerprint param forces the list view drill-down", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(PRIVILEGED)
    vi.mocked(fetchErrorReports).mockResolvedValueOnce({
      configured: true,
      ok: true,
      reports: [],
      pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
    })

    await ErrorsPage({ searchParams: Promise.resolve({ fingerprint: "abc12345" }) })

    const query = vi.mocked(fetchErrorReports).mock.calls[0][0]
    expect(query.view).toBe("list")
    expect(query.fingerprint).toBe("abc12345")
  })

  it("renders (does not throw) when the service token is not configured", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(PRIVILEGED)
    vi.mocked(fetchErrorReports).mockResolvedValueOnce({ configured: false })

    await ErrorsPage({ searchParams: Promise.resolve({}) })

    expect(redirect).not.toHaveBeenCalled()
  })
})
