import { describe, it, expect, vi } from "vitest"

const mod = vi.hoisted(() => ({ getPublicData: vi.fn() }))
vi.mock("@/lib/marketing/public-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/marketing/public-data")>()
  return { ...actual, getPublicData: mod.getPublicData }
})

import { GET } from "@/app/metrics/card/[metric]/route"

const req = new Request("http://localhost/metrics/card/btc-locked")
const params = (metric: string) => ({ params: Promise.resolve({ metric }) })

describe("GET /metrics/card/[metric]", () => {
  it("404s for an unknown metric", async () => {
    const res = await GET(req, params("nope"))
    expect(res.status).toBe(404)
  })

  it("renders a png for a valid metric", async () => {
    mod.getPublicData.mockResolvedValueOnce({
      updatedAt: "2026-07-03T00:00:00.000Z", seriesDays: 10,
      now: { "btc-locked": 94.74 }, deltas7d: { "btc-locked": 1.2 }, series: [],
    })
    const res = await GET(req, params("btc-locked"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("image/png")
  })

  it("still renders (dash value) when data is missing", async () => {
    mod.getPublicData.mockResolvedValueOnce({ updatedAt: null, seriesDays: 0, now: {}, deltas7d: {}, series: [] })
    const res = await GET(req, params("btc-locked"))
    expect(res.status).toBe(200)
  })
})
