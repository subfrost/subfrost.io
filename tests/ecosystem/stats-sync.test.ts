import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ecosystemProject: { findMany: vi.fn() },
    ecosystemStatSnapshot: { create: vi.fn(), deleteMany: vi.fn() },
  },
}))
vi.mock("@/lib/marketing/alkane-details", () => ({ getAlkaneDetails: vi.fn() }))
vi.mock("@/lib/ecosystem/adapters", () => ({
  ECOSYSTEM_ADAPTERS: { arbuzino: vi.fn(async () => [{ key: "jackpot", label: "Tier-5 jackpot", value: "15.04", unit: "DIESEL" }]) },
}))

import { prisma } from "@/lib/prisma"
import { getAlkaneDetails } from "@/lib/marketing/alkane-details"
import { syncEcosystemStats } from "@/lib/ecosystem/stats-sync"
import type { ProjectStats } from "@/lib/ecosystem/stats-types"

const proj = (over: Record<string, unknown>) => ({
  id: "p1", slug: "arbuzino", alkaneId: "2:25349", published: true,
  contracts: [{ alkaneId: "4:257" }, { alkaneId: "2:25349" }],
  ...over,
})
const detail = (id: string) => ({
  id, name: "N", symbol: "S", holders: 10, priceUsd: 0.01, supply: "100000",
  marketcapUsd: 2500, fdvUsd: null, volume24hUsd: 19, priceChange24h: null, priceChange7d: null, priceChange30d: null,
})

beforeEach(() => vi.clearAllMocks())

describe("syncEcosystemStats", () => {
  it("dedupes alkane ids, writes one snapshot with generic+custom, prunes old rows", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([proj({})] as never)
    vi.mocked(getAlkaneDetails).mockImplementation(async (id: string) => detail(id) as never)
    const r = await syncEcosystemStats()
    expect(r).toEqual({ projects: 1, snapshots: 1 })
    expect(vi.mocked(getAlkaneDetails).mock.calls.map((c) => c[0]).sort()).toEqual(["2:25349", "4:257"]) // dedupado
    const created = vi.mocked(prisma.ecosystemStatSnapshot.create).mock.calls[0][0] as unknown as { data: { projectId: string; stats: ProjectStats } }
    expect(created.data.projectId).toBe("p1")
    expect(created.data.stats.custom[0].key).toBe("jackpot")
    expect(Object.keys(created.data.stats.generic).sort()).toEqual(["2:25349", "4:257"])
    expect(prisma.ecosystemStatSnapshot.deleteMany).toHaveBeenCalled()
  })

  it("skips projects with no ids and no adapter; one failure doesn't sink the batch", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValueOnce([
      proj({ id: "a", slug: "no-ids", alkaneId: null, contracts: [] }),
      proj({ id: "b", slug: "boom", alkaneId: "2:0", contracts: [] }),
      proj({ id: "c", slug: "ok", alkaneId: "32:0", contracts: [] }),
    ] as never)
    vi.mocked(getAlkaneDetails).mockImplementation(async (id: string) => {
      if (id === "2:0") throw new Error("boom")
      return detail(id) as never
    })
    const r = await syncEcosystemStats()
    expect(r.snapshots).toBe(1) // só "ok" (boom falhou, no-ids pulado)
    expect(prisma.ecosystemStatSnapshot.create).toHaveBeenCalledTimes(1)
  })
})

describe("stats-cron route auth", () => {
  it("401s with wrong bearer when PREFETCH_SECRET is set; 200 without env", async () => {
    vi.mocked(prisma.ecosystemProject.findMany).mockResolvedValue([] as never)
    const { GET } = await import("@/app/api/ecosystem/stats-cron/route")
    vi.stubEnv("PREFETCH_SECRET", "s3cret")
    const denied = await GET(new Request("http://x/api/ecosystem/stats-cron", { headers: { authorization: "Bearer wrong" } }) as never)
    expect(denied.status).toBe(401)
    const okAuth = await GET(new Request("http://x/api/ecosystem/stats-cron", { headers: { authorization: "Bearer s3cret" } }) as never)
    expect(okAuth.status).toBe(200)
    vi.unstubAllEnvs()
    const open = await GET(new Request("http://x/api/ecosystem/stats-cron") as never)
    expect(open.status).toBe(200)
  })
})
