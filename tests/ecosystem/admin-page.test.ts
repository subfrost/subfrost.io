// tests/ecosystem/admin-page.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT:${to}`) }),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ecosystemProject: { findMany: vi.fn() },
    ecosystemSettings: { findUnique: vi.fn() },
  },
}))

import { currentUser } from "@/lib/cms/authz"
import { prisma } from "@/lib/prisma"
import EcosystemAdminPage from "@/app/admin/ecosystem/page"

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.ecosystemProject.findMany as never as ReturnType<typeof vi.fn>).mockResolvedValue([])
  vi.mocked(prisma.ecosystemSettings.findUnique as never as ReturnType<typeof vi.fn>).mockResolvedValue(null)
})

describe("/admin/ecosystem gating", () => {
  it("redirects to login when signed out", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(null as never)
    await expect(EcosystemAdminPage()).rejects.toThrow("NEXT_REDIRECT:/admin/login")
  })

  it("redirects to /admin without ecosystem.view", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce({ privileges: ["articles.write"] } as never)
    await expect(EcosystemAdminPage()).rejects.toThrow("NEXT_REDIRECT:/admin")
  })

  it("renders for a viewer", async () => {
    vi.mocked(currentUser).mockResolvedValueOnce({ privileges: ["ecosystem.view"] } as never)
    await expect(EcosystemAdminPage()).resolves.toBeTruthy()
  })
})
