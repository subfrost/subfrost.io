import { describe, it, expect, vi } from "vitest"

const mod = vi.hoisted(() => ({ getPublicData: vi.fn() }))
vi.mock("@/lib/marketing/public-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/marketing/public-data")>()
  return { ...actual, getPublicData: mod.getPublicData }
})

import { GET } from "@/app/api/data/route"

describe("GET /api/data", () => {
  it("returns payload with public cache headers", async () => {
    mod.getPublicData.mockResolvedValueOnce({ updatedAt: null, seriesDays: 0, now: {}, deltas7d: {}, series: [] })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=600")
    const body = await res.json()
    expect(body.seriesDays).toBe(0)
  })

  it("returns 503 when the assembler rejects", async () => {
    mod.getPublicData.mockRejectedValueOnce(new Error("boom"))
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe("unavailable")
  })
})
