// tests/ecosystem/public.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ecosystemProject: { findMany: vi.fn(), findFirst: vi.fn() },
    ecosystemSettings: { findUnique: vi.fn() },
    ecosystemStatSnapshot: { findFirst: vi.fn() },
  },
}))

import { prisma } from "@/lib/prisma"
import { getEcosystemDirectory, getEcosystemStatsWithDelta } from "@/lib/ecosystem/public"

const row = (over: Record<string, unknown>) => ({
  slug: "x", name: "X", logoUrl: null, category: "DeFi", status: "Live",
  kind: "App", alkaneId: null,
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

  it("maps kind and alkaneId verbatim", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([
      row({ slug: "c", kind: "Contract", alkaneId: "2:0" }),
    ] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce(null as never)
    const { projects } = await getEcosystemDirectory("en")
    const p = projects.find((p) => p.slug === "c")
    expect(p?.kind).toBe("Contract")
    expect(p?.alkaneId).toBe("2:0")
  })
})

describe("getEcosystemStatsWithDelta", () => {
  const proj = { id: "p1" }
  const snap = (takenAt: string, stats: unknown) => ({ takenAt: new Date(takenAt), stats })
  const S = (holders: number) => ({ generic: { "2:0": { holders } }, custom: [] })

  it("returns null for an unknown/unpublished slug", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(null as never)
    expect(await getEcosystemStatsWithDelta("nope")).toBeNull()
  })

  it("returns null when there is no snapshot", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(proj as never)
    vi.mocked(prisma.ecosystemStatSnapshot.findFirst).mockResolvedValueOnce(null as never)
    expect(await getEcosystemStatsWithDelta("x")).toBeNull()
  })

  it("pairs current with the snapshot ~24h before and labels it 24h", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(proj as never)
    const current = snap("2026-07-05T18:00:00Z", S(1234))
    const base24 = snap("2026-07-04T18:00:00Z", S(1000))
    vi.mocked(prisma.ecosystemStatSnapshot.findFirst).mockImplementation(((args: unknown) => {
      const a = args as { where: { takenAt?: { lte?: Date; lt?: Date } }; orderBy: { takenAt: string } }
      if (a.where.takenAt?.lte) return Promise.resolve(base24 as never) // cutoff query
      if (a.orderBy.takenAt === "asc") return Promise.resolve(null as never)
      return Promise.resolve(current as never) // desc, sem filtro → current
    }) as never)
    const r = await getEcosystemStatsWithDelta("x")
    expect((r!.current as never as ReturnType<typeof S>).generic["2:0"].holders).toBe(1234)
    expect((r!.baseline as never as ReturnType<typeof S>).generic["2:0"].holders).toBe(1000)
    expect(r!.periodLabel).toBe("24h")
  })

  it("falls back to the oldest snapshot and labels the real gap when <24h of history", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(proj as never)
    const current = snap("2026-07-05T18:00:00Z", S(1234))
    const oldest = snap("2026-07-05T06:00:00Z", S(1100)) // 12h atrás
    vi.mocked(prisma.ecosystemStatSnapshot.findFirst).mockImplementation(((args: unknown) => {
      const a = args as { where: { takenAt?: { lte?: Date; lt?: Date } }; orderBy: { takenAt: string } }
      if (a.where.takenAt?.lte) return Promise.resolve(null as never)     // nada ≥24h atrás
      if (a.orderBy.takenAt === "asc") return Promise.resolve(oldest as never)
      return Promise.resolve(current as never)
    }) as never)
    const r = await getEcosystemStatsWithDelta("x")
    expect(r!.periodLabel).toBe("12h")
    expect((r!.baseline as never as ReturnType<typeof S>).generic["2:0"].holders).toBe(1100)
  })

  it("returns baseline null / periodLabel null with a single snapshot", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(proj as never)
    const current = snap("2026-07-05T18:00:00Z", S(1234))
    vi.mocked(prisma.ecosystemStatSnapshot.findFirst).mockImplementation(((args: unknown) => {
      const a = args as { where: { takenAt?: { lte?: Date } }; orderBy: { takenAt: string } }
      if (a.where.takenAt?.lte) return Promise.resolve(null as never)
      if (a.orderBy.takenAt === "asc") return Promise.resolve(null as never) // nenhum anterior ao current
      return Promise.resolve(current as never)
    }) as never)
    const r = await getEcosystemStatsWithDelta("x")
    expect(r!.baseline).toBeNull()
    expect(r!.periodLabel).toBeNull()
  })
})
