// tests/ecosystem/public.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ecosystemProject: { findMany: vi.fn() },
    ecosystemSettings: { findUnique: vi.fn() },
  },
}))

import { prisma } from "@/lib/prisma"
import { getEcosystemDirectory } from "@/lib/ecosystem/public"

const row = (over: Record<string, unknown>) => ({
  slug: "x", name: "X", logoUrl: null, category: "DeFi", status: "Live",
  url: "https://x.io", xUrl: null, docsUrl: null,
  descriptionEn: "english", descriptionZh: "中文",
  featured: false, sortOrder: 0, published: true, ...over,
})

beforeEach(() => vi.clearAllMocks())

describe("getEcosystemDirectory", () => {
  it("queries only published, in directory order", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce(null as never)
    await getEcosystemDirectory("en")
    expect(prisma.ecosystemProject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { published: true },
        orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      })
    )
  })

  it("resolves zh with fallback to en", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([
      row({ slug: "a", descriptionZh: "中文" }),
      row({ slug: "b", descriptionZh: "" }),
    ] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce(null as never)
    const { projects } = await getEcosystemDirectory("zh")
    expect(projects.find((p) => p.slug === "a")?.description).toBe("中文")
    expect(projects.find((p) => p.slug === "b")?.description).toBe("english")
  })

  it("defaults featuredBandEnabled to true when no settings row", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce(null as never)
    const { featuredBandEnabled } = await getEcosystemDirectory("en")
    expect(featuredBandEnabled).toBe(true)
  })

  it("respects a disabled settings row", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce({ id: 1, featuredBandEnabled: false } as never)
    const { featuredBandEnabled } = await getEcosystemDirectory("en")
    expect(featuredBandEnabled).toBe(false)
  })
})
