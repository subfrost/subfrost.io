import { describe, it, expect, vi } from "vitest"

const store = vi.hoisted(() => ({ listOpReturnDaily: vi.fn() }))
vi.mock("@/lib/marketing/opreturn-store", () => store)

import { NextRequest } from "next/server"
import { GET, resolveRows } from "@/app/metrics/chart/opreturn/route"
import { CHART_SPECS } from "@/lib/marketing/chart-specs"
import type { OpReturnRow } from "@/lib/marketing/opreturn-types"
import type { PublicOpReturnPayload } from "@/lib/marketing/public-opreturn"

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

/**
 * A fully-populated PublicOpReturnPayload fixture, built directly (not via `listOpReturnDaily` +
 * `getPublicOpReturnData`) so `resolveRows` can be unit-tested in isolation against known values.
 * Every field that shares a shape with another field (e.g. all seven `OpReturnPoint[]` fields —
 * `dieselTxShare`/`minerRevenueUsd`/`alkanesFeeShare`/`weightShare`/`ugDieselShare`/
 * `dieselMintsPerDay`/`dieselCumulative` — or the four `{date,alkanes,pureRunes}[]` fields —
 * `runesVsAlkanesShare`/`runesVsAlkanesBytes`/`runestoneTxShare`/`runestoneTxCount`) gets its own
 * DISTINCT numbers on purpose: if `resolveRows` ever read the wrong same-typed field for a given
 * chart id (a swap that type-checks cleanly since every field in a group shares one type), the
 * resolved values below would no longer match the fixture for the field the test actually asserts
 * on, and the test would fail.
 */
const FIXTURE_PAYLOAD: PublicOpReturnPayload = {
  updatedAt: "2026-06-02",
  days: 2,
  header: { firstDate: "2026-06-01", lastDate: "2026-06-02", totalTxSampled: 600000 },
  dailyShare: [
    { date: "2026-06-01", txShare: 0.11, opReturnPenetration: 0.51 },
    { date: "2026-06-02", txShare: 0.12, opReturnPenetration: 0.52 },
  ],
  opReturnShare: [
    { date: "2026-06-01", txPct: 0.21, bytesPct: 0.31 },
    { date: "2026-06-02", txPct: 0.22, bytesPct: 0.32 },
  ],
  latestDonut: { date: "2026-06-02", diesel: 900, alkanesOther: 100, other: 500 },
  dieselTxShare: [
    { date: "2026-06-01", value: 1001 },
    { date: "2026-06-02", value: 1002 },
  ],
  bytesComposition: { alkanes: 0.6, runes: 0.25, other: 0.15 },
  bytesPerTx: [
    { date: "2026-06-01", alkanes: 41, rest: 42 },
    { date: "2026-06-02", alkanes: 43, rest: 44 },
  ],
  minerRevenueUsd: [
    { date: "2026-06-01", value: 2001 },
    { date: "2026-06-02", value: 2002 },
  ],
  feesSplitBtc: [
    { date: "2026-06-01", alkanes: 51, rest: 52 },
    { date: "2026-06-02", alkanes: 53, rest: 54 },
  ],
  alkanesFeeShare: [
    { date: "2026-06-01", value: 3001 },
    { date: "2026-06-02", value: 3002 },
  ],
  weightShare: [
    { date: "2026-06-01", value: 4001 },
    { date: "2026-06-02", value: 4002 },
  ],
  ugDieselShare: [
    { date: "2026-06-01", value: 5001 },
    { date: "2026-06-02", value: 5002 },
  ],
  fourAnswers: [
    { date: "2026-06-01", byTx: 0.61, byBytes: 0.62, byWeight: 0.63, byFee: 0.64 },
    { date: "2026-06-02", byTx: 0.65, byBytes: 0.66, byWeight: 0.67, byFee: 0.68 },
  ],
  dieselMintsPerDay: [
    { date: "2026-06-01", value: 111 },
    { date: "2026-06-02", value: 222 },
  ],
  dieselCumulative: [
    { date: "2026-06-01", value: 6001 },
    { date: "2026-06-02", value: 6002 },
  ],
  feePerTx: [
    { date: "2026-06-01", alkanes: 71, rest: 72 },
    { date: "2026-06-02", alkanes: 73, rest: 74 },
  ],
  ugMintsPerDay: [
    { date: "2026-06-01", diesel: 81, independent: 82 },
    { date: "2026-06-02", diesel: 83, independent: 84 },
  ],
  runesVsAlkanesShare: [
    { date: "2026-06-01", alkanes: 0.73, pureRunes: 0.27 },
    { date: "2026-06-02", alkanes: 0.74, pureRunes: 0.26 },
  ],
  runesVsAlkanesBytes: [
    { date: "2026-06-01", alkanes: 9001, pureRunes: 9002 },
    { date: "2026-06-02", alkanes: 9003, pureRunes: 9004 },
  ],
  byteComposition: [
    { date: "2026-06-01", alkanes: 0.81, pureRunes: 0.11, other: 0.08 },
    { date: "2026-06-02", alkanes: 0.82, pureRunes: 0.1, other: 0.08 },
  ],
  runestoneTxShare: [
    { date: "2026-06-01", alkanes: 0.91, pureRunes: 0.09 },
    { date: "2026-06-02", alkanes: 0.92, pureRunes: 0.08 },
  ],
  runestoneTxCount: [
    { date: "2026-06-01", alkanes: 9501, pureRunes: 9502 },
    { date: "2026-06-02", alkanes: 9503, pureRunes: 9504 },
  ],
  stats: {
    last30: { alkanesOfOpReturnTx: null, alkanesOfOpReturnBytes: null, alkanesFeeShare: null, opReturnFeeShare: null },
    full: { alkanesFeeShare: null, opReturnFeeShare: null, alkanesBytesPerTx: null },
    latest: null,
    weight: { full: null, latest: null },
    ug: { early30: null, last30: null, full: null },
  },
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

// Regression guard for the "Data-mapping regression coverage is thin" review finding: every test
// above only checks "renders a real PNG" (status + magic bytes + length), which can't distinguish
// correct values from a swapped-field bug (e.g. resolveRows accidentally reading `alkanesFeeShare`
// for `diesel-tx-share` — both `OpReturnPoint[]`, both routed through `spreadRows`, so no type
// error would result). These tests call `resolveRows` directly and assert the EXACT values it
// returns, keyed by each chart's own `spec.series[].key`, against the deliberately-distinct
// FIXTURE_PAYLOAD above — a field mixup changes the asserted numbers, not just presence/shape.
describe("resolveRows (exact value mapping)", () => {
  it("maps diesel-mints-per-day (1-series) from payload.dieselMintsPerDay, not a same-shaped sibling field", () => {
    const spec = CHART_SPECS["diesel-mints-per-day"]
    const rows = resolveRows("diesel-mints-per-day", FIXTURE_PAYLOAD, "full")
    expect(rows.map((r) => r.date)).toEqual(["2026-06-01", "2026-06-02"])
    expect(rows.map((r) => r[spec.series[0].key])).toEqual([111, 222])
  })

  it("maps runes-vs-alkanes-share (multi-series) from payload.runesVsAlkanesShare, not a same-shaped sibling field", () => {
    const spec = CHART_SPECS["runes-vs-alkanes-share"]
    const rows = resolveRows("runes-vs-alkanes-share", FIXTURE_PAYLOAD, "full")
    expect(rows.map((r) => r.date)).toEqual(["2026-06-01", "2026-06-02"])
    expect(rows.map((r) => r[spec.series[0].key])).toEqual([0.73, 0.74]) // "alkanes"
    expect(rows.map((r) => r[spec.series[1].key])).toEqual([0.27, 0.26]) // "pureRunes"
  })
})
