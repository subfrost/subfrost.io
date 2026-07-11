import { describe, it, expect, vi } from "vitest"

const store = vi.hoisted(() => ({ listOpReturnDaily: vi.fn() }))
vi.mock("@/lib/marketing/opreturn-store", () => store)

import { NextRequest } from "next/server"
import { GET } from "@/app/metrics/chart/opreturn/route"
import type { OpReturnRow } from "@/lib/marketing/opreturn-types"

// Same fixture shape as tests/marketing/public-opreturn.test.ts — reused here so the resolved
// series (byteComposition, bytesComposition, etc.) come out with real, non-degenerate numbers.
function row(date: string, over: Partial<OpReturnRow> = {}): OpReturnRow {
  return {
    date, fromHeight: 900000, toHeight: 900100, blocksScanned: 100,
    totalTx: 300000, txWithOpReturn: 150000, txAlkanes: 24000,
    opReturnBytes: 1_500_000, runestoneBytes: 1_300_000, alkanesBytes: 500_000, dieselMints: 23000,
    feeTotalSats: 160_000_000, feeAlkanesSats: 1_600_000, feeOpReturnSats: 12_000_000, btcUsd: 60000,
    ...over,
  }
}

const FIXTURE: OpReturnRow[] = [
  row("2026-06-01"),
  row("2026-06-02", { txAlkanes: 26000, alkanesBytes: 540_000, dieselMints: 25000 }),
  row("2026-06-03", { txAlkanes: 28000, alkanesBytes: 560_000, dieselMints: 27000 }),
]

// Mirrors app/metrics/card/opreturn/route.tsx's CACHE constant by value (not imported — that
// constant isn't exported — so this pins the two routes to the same cache policy on purpose).
const EXPECTED_CACHE = "public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400"

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const req = (qs: string) => new NextRequest(`https://subfrost.io/metrics/chart/opreturn?${qs}`)

/**
 * Consumes the response body and asserts it's a real, non-trivial PNG. This is the actual satori
 * proof: `new ImageResponse(...)` returns a 200 with the right headers synchronously — satori only
 * runs (and can only throw, e.g. on an unsupported element) once the body stream is read. A test
 * that only checks `res.status`/`res.headers` never triggers the render and would pass even if
 * ChartBody's JSX were rejected by satori at encode time (this bit a first draft of this route —
 * see task-3-report.md: satori rejects `<text>` embedded inside a raw `<svg>` subtree, which
 * ChartBody used for every axis/legend label — only caught once a test here actually read the
 * body).
 */
async function expectPng(res: Response) {
  expect(res.status).toBe(200)
  expect(res.headers.get("content-type")).toContain("image/png")
  const buf = new Uint8Array(await res.arrayBuffer())
  expect(buf.length).toBeGreaterThan(500) // a real rasterized 1200x675 PNG, not an empty/stub body
  expect(Array.from(buf.slice(0, 8))).toEqual(PNG_MAGIC)
}

describe("GET /metrics/chart/opreturn", () => {
  it("renders a line chart (diesel-mints-per-day, log scale) as a cacheable PNG", async () => {
    store.listOpReturnDaily.mockResolvedValue(FIXTURE)
    const res = await GET(req("id=diesel-mints-per-day&window=full"))
    expect(res.headers.get("cache-control")).toBe(EXPECTED_CACHE)
    await expectPng(res)
  })

  it("400s for an unknown chart id", async () => {
    store.listOpReturnDaily.mockResolvedValue(FIXTURE)
    const res = await GET(req("id=__nope__"))
    expect(res.status).toBe(400)
  })

  it("renders a stacked chart (byte-composition)", async () => {
    store.listOpReturnDaily.mockResolvedValue(FIXTURE)
    const res = await GET(req("id=byte-composition&window=full"))
    await expectPng(res)
  })

  it("renders a donut chart (bytes-donut)", async () => {
    store.listOpReturnDaily.mockResolvedValue(FIXTURE)
    const res = await GET(req("id=bytes-donut&window=full"))
    await expectPng(res)
  })

  it("renders the last-day donut (last-day-composition) with the synthetic alkanes = diesel + alkanesOther slice", async () => {
    store.listOpReturnDaily.mockResolvedValue(FIXTURE)
    const res = await GET(req("id=last-day-composition&window=full"))
    await expectPng(res)
  })

  it("400s for an unknown window", async () => {
    store.listOpReturnDaily.mockResolvedValue(FIXTURE)
    const res = await GET(req("id=diesel-mints-per-day&window=avg9999"))
    expect(res.status).toBe(400)
  })

  it("400s for an unknown theme", async () => {
    store.listOpReturnDaily.mockResolvedValue(FIXTURE)
    const res = await GET(req("id=diesel-mints-per-day&theme=neon"))
    expect(res.status).toBe(400)
  })

  it("never 500s on an empty store — renders the frame with an empty plot", async () => {
    store.listOpReturnDaily.mockResolvedValue([])
    const res = await GET(req("id=diesel-mints-per-day&window=full"))
    await expectPng(res)
  })

  it("never 500s when the store throws — renders the frame with an empty plot", async () => {
    store.listOpReturnDaily.mockRejectedValue(new Error("db down"))
    const res = await GET(req("id=diesel-mints-per-day&window=full"))
    await expectPng(res)
  })

  it("renders every chart id in CHART_SPECS without throwing (full sweep of all draw paths)", async () => {
    store.listOpReturnDaily.mockResolvedValue(FIXTURE)
    const { CHART_SPECS } = await import("@/lib/marketing/chart-specs")
    for (const id of Object.keys(CHART_SPECS)) {
      const res = await GET(req(`id=${id}&window=full`))
      expect(res.status, `id=${id}`).toBe(200)
      const buf = new Uint8Array(await res.arrayBuffer())
      expect(Array.from(buf.slice(0, 8)), `id=${id}`).toEqual(PNG_MAGIC)
    }
  })

  it("supports the light theme", async () => {
    store.listOpReturnDaily.mockResolvedValue(FIXTURE)
    const res = await GET(req("id=diesel-mints-per-day&window=full&theme=light"))
    await expectPng(res)
  })
})
