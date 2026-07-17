// tests/ecosystem/profile-public.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ecosystemProject: { findFirst: vi.fn() },
    ecosystemStatSnapshot: { findFirst: vi.fn() },
  },
}))

import { prisma } from "@/lib/prisma"
import { getEcosystemProfile, getLatestEcosystemStats } from "@/lib/ecosystem/public"

const row = (over: Record<string, unknown>) => ({
  slug: "arbuzino", name: "Arbuzino", logoUrl: null, category: "Gaming", status: "Live",
  kind: "App", alkaneId: "2:25349", url: "https://arbuzino.com", xUrl: null, docsUrl: null,
  descriptionEn: "english", descriptionZh: "中文",
  profileEn: "# Profile EN", profileZh: "",
  featured: false, sortOrder: 0, published: true,
  contracts: [
    { id: "c2", label: "Fireball", alkaneId: "4:257", noteEn: "lottery", noteZh: "彩票", sortOrder: 1 },
    { id: "c1", label: "ARBUZ", alkaneId: "2:25349", noteEn: "token", noteZh: "", sortOrder: 0 },
  ],
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe("getEcosystemProfile", () => {
  it("queries published by slug including ordered contracts", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(row({}) as never)
    await getEcosystemProfile("arbuzino", "en")
    expect(prisma.ecosystemProject.findFirst).toHaveBeenCalledWith({
      where: { slug: "arbuzino", published: true },
      include: { contracts: { orderBy: { sortOrder: "asc" } } },
    })
  })

  it("returns null when not found", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(null as never)
    expect(await getEcosystemProfile("nope", "en")).toBeNull()
  })

  it("resolves profile + notes per locale with EN fallback", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValue(row({}) as never)
    const en = await getEcosystemProfile("arbuzino", "en")
    expect(en?.profile).toBe("# Profile EN")
    expect(en?.contracts.map((c) => c.note)).toEqual(["lottery", "token"]) // preserva a ordem vinda do Prisma
    const zh = await getEcosystemProfile("arbuzino", "zh")
    expect(zh?.profile).toBe("# Profile EN") // profileZh empty → EN fallback
    expect(zh?.description).toBe("中文")
    const fireball = zh?.contracts.find((c) => c.alkaneId === "4:257")
    const arbuz = zh?.contracts.find((c) => c.alkaneId === "2:25349")
    expect(fireball?.note).toBe("彩票")
    expect(arbuz?.note).toBe("token") // noteZh empty → EN fallback
  })

  it("maps contracts verbatim (label + alkaneId)", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(row({}) as never)
    const p = await getEcosystemProfile("arbuzino", "en")
    expect(p?.contracts.map((c) => c.label)).toContain("Fireball")
    expect(p?.contracts.map((c) => c.alkaneId)).toContain("4:257")
  })
})

describe("getLatestEcosystemStats", () => {
  it("returns the newest snapshot stats or null", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce({ id: "p1" } as never)
    vi.mocked(prisma.ecosystemStatSnapshot.findFirst).mockResolvedValueOnce({ stats: { generic: {}, custom: [] } } as never)
    expect(await getLatestEcosystemStats("arbuzino")).toEqual({ generic: {}, custom: [] })
    expect(prisma.ecosystemStatSnapshot.findFirst).toHaveBeenCalledWith({
      where: { projectId: "p1" }, orderBy: { takenAt: "desc" },
    })
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(null as never)
    expect(await getLatestEcosystemStats("nope")).toBeNull()
  })
})
