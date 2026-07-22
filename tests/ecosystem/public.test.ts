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
  featured: false, inMosaic: false, sortOrder: 0, published: true, ...over,
})

beforeEach(() => vi.clearAllMocks())

describe("getEcosystemDirectory", () => {
  it("queries only published projects", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce(null as never)
    await getEcosystemDirectory("en")
    expect(prisma.ecosystemProject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { published: true },
      })
    )
  })

  it("orders featured projects before non-featured, regardless of status or name", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([
      row({ slug: "z-live", name: "Z Live", featured: false, status: "Live" }),
      row({ slug: "a-featured", name: "A Featured", featured: true, status: "Building" }),
    ] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce(null as never)
    const { projects } = await getEcosystemDirectory("en")
    expect(projects.map((p) => p.slug)).toEqual(["a-featured", "z-live"])
  })

  it("orders two featured projects by sortOrder ascending, ignoring name", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([
      row({ slug: "alpha", name: "Alpha", featured: true, sortOrder: 2 }),
      row({ slug: "zeta", name: "Zeta", featured: true, sortOrder: 1 }),
    ] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce(null as never)
    const { projects } = await getEcosystemDirectory("en")
    expect(projects.map((p) => p.slug)).toEqual(["zeta", "alpha"])
  })

  it("falls back to name A-Z when two featured projects share the same sortOrder", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([
      row({ slug: "z-featured", name: "Z Featured", featured: true, sortOrder: 1 }),
      row({ slug: "a-featured", name: "A Featured", featured: true, sortOrder: 1 }),
    ] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce(null as never)
    const { projects } = await getEcosystemDirectory("en")
    expect(projects.map((p) => p.slug)).toEqual(["a-featured", "z-featured"])
  })

  it("does not apply status rank within the featured band: a Building project with a low sortOrder beats a Live project with a higher one", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([
      row({ slug: "live-featured", name: "Live Featured", featured: true, status: "Live", sortOrder: 2 }),
      row({ slug: "building-featured", name: "Building Featured", featured: true, status: "Building", sortOrder: 1 }),
    ] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce(null as never)
    const { projects } = await getEcosystemDirectory("en")
    expect(projects.map((p) => p.slug)).toEqual(["building-featured", "live-featured"])
  })

  it("orders all Live before all Building within non-featured", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([
      row({ slug: "b-building", name: "B Building", status: "Building" }),
      row({ slug: "a-live", name: "A Live", status: "Live" }),
      row({ slug: "y-building", name: "Y Building", status: "Building" }),
      row({ slug: "z-live", name: "Z Live", status: "Live" }),
    ] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce(null as never)
    const { projects } = await getEcosystemDirectory("en")
    expect(projects.map((p) => p.slug)).toEqual(["a-live", "z-live", "b-building", "y-building"])
  })

  it("sorts Beta between Live and Building", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([
      row({ slug: "building-one", name: "Building One", status: "Building" }),
      row({ slug: "live-one", name: "Live One", status: "Live" }),
      row({ slug: "beta-one", name: "Beta One", status: "Beta" }),
    ] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce(null as never)
    const { projects } = await getEcosystemDirectory("en")
    expect(projects.map((p) => p.slug)).toEqual(["live-one", "beta-one", "building-one"])
  })

  it("sorts names A-Z case-insensitively within a status", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([
      row({ slug: "arbuz", name: "ARBUZ", status: "Live" }),
      row({ slug: "alkanex", name: "Alkanex", status: "Live" }),
      row({ slug: "acai", name: "acai", status: "Live" }),
    ] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce(null as never)
    const { projects } = await getEcosystemDirectory("en")
    expect(projects.map((p) => p.slug)).toEqual(["acai", "alkanex", "arbuz"])
  })

  it("does not let a large sortOrder jump the queue", async () => {
    // Regression: sortOrder used to dominate ordering. A Building project with a huge
    // sortOrder must still land after a Live project with sortOrder 0.
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([
      row({ slug: "old-building", name: "Old Building", status: "Building", sortOrder: 999 }),
      row({ slug: "new-live", name: "New Live", status: "Live", sortOrder: 0 }),
    ] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce(null as never)
    const { projects } = await getEcosystemDirectory("en")
    expect(projects.map((p) => p.slug)).toEqual(["new-live", "old-building"])
  })

  it("sorts an unrecognised status last instead of scrambling the list", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([
      row({ slug: "mystery", name: "Mystery", status: "Deprecated" }),
      row({ slug: "b-building", name: "B Building", status: "Building" }),
      row({ slug: "a-live", name: "A Live", status: "Live" }),
    ] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce(null as never)
    const { projects } = await getEcosystemDirectory("en")
    expect(projects.map((p) => p.slug)).toEqual(["a-live", "b-building", "mystery"])
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

  it("maps inMosaic verbatim", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([
      row({ slug: "d", inMosaic: true }),
      row({ slug: "e", inMosaic: false }),
    ] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce(null as never)
    const { projects } = await getEcosystemDirectory("en")
    expect(projects.find((p) => p.slug === "d")?.inMosaic).toBe(true)
    expect(projects.find((p) => p.slug === "e")?.inMosaic).toBe(false)
  })

  it("maps showMarketStats verbatim", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([
      row({ slug: "f", showMarketStats: true }),
    ] as never)
    vi.mocked(prisma.ecosystemSettings.findUnique).mockResolvedValueOnce(null as never)
    const { projects } = await getEcosystemDirectory("en")
    expect(projects.find((p) => p.slug === "f")?.showMarketStats).toBe(true)
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
