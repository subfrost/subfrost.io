import { describe, it, expect, vi, beforeEach } from "vitest"

// Bypass the Redis cache: run the compute fn directly so we exercise the upstream
// shape handling. This is the layer that must never cache (and thus never serve
// for 3 min) a payload the dashboard would crash on.
vi.mock("@/lib/redis", () => ({
  cacheGetOrCompute: (_key: string, compute: () => Promise<unknown>) => compute(),
}))

import { GET } from "@/app/api/network-health/route"

const okUpstream = (body: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })

beforeEach(() => vi.clearAllMocks())

describe("GET /api/network-health", () => {
  it("passes a well-formed upstream snapshot through untouched", async () => {
    const snap = { healthy: true, endpoints: [{ id: "a", name: "A", status: "ok", height: 100 }], comparison: null, timestamp: "t" }
    global.fetch = okUpstream(snap) as never

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.endpoints).toEqual(snap.endpoints)
    expect(data.healthy).toBe(true)
  })

  it("degrades to a safe endpoints:[] envelope when a 200 upstream omits endpoints (cache-poison guard)", async () => {
    // The real prod incident: upstream answered 200 during a rollout with a
    // partial body (no endpoints[]). Unguarded, that shape gets cached for 3 min
    // and every dashboard load crashes on health.endpoints.map().
    global.fetch = okUpstream({ healthy: false, comparison: null }) as never

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(502)
    expect(Array.isArray(data.endpoints)).toBe(true)
    expect(data.endpoints).toEqual([])
    expect(data.error).toMatch(/endpoints/i)
  })

  it("degrades when endpoints is present but not an array", async () => {
    global.fetch = okUpstream({ healthy: true, endpoints: null, comparison: null }) as never

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(502)
    expect(data.endpoints).toEqual([])
  })
})
