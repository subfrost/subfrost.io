import { ImageResponse } from "next/og"
import { NextRequest } from "next/server"
import { listOpReturnDaily } from "@/lib/marketing/opreturn-store"
import { getPublicOpReturnData, type PublicOpReturnPayload } from "@/lib/marketing/public-opreturn"
import { parseChartParams } from "@/lib/marketing/chart-specs"
import { WINDOW_DAYS, WINDOW_LABELS, type WindowKey } from "@/lib/marketing/opreturn-types"
import type { OpReturnRow } from "@/lib/marketing/opreturn-types"
import { loadOgLogomark, loadOgFont } from "@/lib/og-assets"
import { ChartBody, type ChartRow } from "@/lib/marketing/chart-draw"

// Canonical server-rendered PNG for any of the 21 /metrics OP_RETURN charts (the "Copy chart"
// button next to each Card). Same outer frame as the sibling stat-card route (app/metrics/card/
// opreturn/route.tsx): enum-validated params (parseChartParams) keep the URL space finite and
// fully CDN-cacheable, nodejs runtime for satori + fs-based asset loading. Series data is resolved
// from the SAME builder the page itself renders from (getPublicOpReturnData) -- resolveRows below
// only maps a spec's series[].key to the matching payload field and window-slices it; it never
// recomputes a formula that already lives in lib/marketing/public-opreturn.ts.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SIZE = { width: 1200, height: 675 }
const CACHE = "public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400"

// Content box is 1200x675 minus the 72px padding on every side (1056x531). CHART_H leaves room
// for the title row (~48px) + gap (16px) above it plus the header/footer rows below/above.
const CHART_W = 1056
const CHART_H = 372

/**
 * Slices a date-keyed series to the selected WindowKey. Mirrors the private windowRows() in
 * lib/marketing/opreturn-metrics.ts (same rule: "ytd" keeps rows dated on/after the last row's
 * Jan 1, a fixed N keeps the last N rows, "full" keeps everything) -- applied here to the
 * already-resolved payload series instead of the raw OpReturnRow[]. Since every series has
 * exactly one row per date, slicing at either point gives the same result.
 */
function windowSlice<T extends { date: string }>(arr: T[], window: WindowKey): T[] {
  if (arr.length === 0) return arr
  if (window === "ytd") {
    const last = arr[arr.length - 1]
    const yearStart = `${last.date.slice(0, 4)}-01-01`
    return arr.filter((r) => r.date >= yearStart)
  }
  const n = WINDOW_DAYS[window]
  return n === null ? arr : arr.slice(-n)
}

/**
 * A handful of PublicOpReturnPayload fields (weightShare, dieselTxShare, dieselMintsPerDay,
 * dieselCumulative, ugDieselShare, minerRevenueUsd, alkanesFeeShare) are typed as the NAMED
 * `OpReturnPoint` interface rather than an inline object-literal type. TypeScript only performs
 * its "does every property satisfy the index signature" structural check for inline/anonymous
 * object-literal types -- a `interface`-declared type is never implicitly checked against an
 * index signature, even when structurally identical (a documented TS quirk, not a real shape
 * mismatch: every other case below is an inline-typed payload field and passes straight through
 * with zero conversion). Re-spreading each row into a fresh literal sidesteps that quirk without
 * an `as` cast or hand-listing field names.
 */
function spreadRows<T extends { date: string }>(arr: T[]): ChartRow[] {
  return arr.map((r) => ({ ...r }))
}

/**
 * Maps a ChartSpec id to its ChartRow[], read off PublicOpReturnPayload. Every non-donut payload
 * array is already shaped `{ date, ...fields named exactly like the spec's series[].key }` (see
 * chart-specs.ts's own header comment), so most cases are a direct window-sliced pass-through --
 * no formula is recomputed here, only reshaped/renamed-by-construction (TS structural typing).
 *
 * The two donuts have no natural per-date row -- each is a single snapshot object on the payload
 * -- so they're wrapped into a length-1 ChartRow[] using the SAME slice combination the page
 * computes client-side (components/data/OpReturnCharts.tsx):
 *   - "last-day-composition": alkanes = diesel + alkanesOther, other = other (donut.other as-is).
 *   - "bytes-donut": alkanes/runes/other pass straight through from bytesComposition.
 * Neither donut is window-sliced: both are fixed snapshots on the page (latest day / since
 * DIESEL genesis) that ignore the window toggle entirely -- see the page's own comment on
 * `cardWindow` ("Cumulative / since-genesis cards ... stay full").
 *
 * A missing/empty series (e.g. `latestDonut`/`bytesComposition` null because the store is empty)
 * yields an empty ChartRow[], never a throw -- ChartBody renders that as a "No data" plot instead
 * of a 500. Unknown ids can't reach here (parseChartParams already 400s them); default is a safety
 * net, not a code path expected to run.
 */
function resolveRows(id: string, payload: PublicOpReturnPayload, window: WindowKey): ChartRow[] {
  switch (id) {
    case "daily-alkanes-share":
      return windowSlice(payload.dailyShare, window)
    case "alkanes-share-of-opreturn":
      return windowSlice(payload.opReturnShare, window)
    case "alkanes-weight-share":
      return windowSlice(spreadRows(payload.weightShare), window)
    case "four-answers":
      return windowSlice(payload.fourAnswers, window)
    case "last-day-composition": {
      const d = payload.latestDonut
      return d ? [{ date: d.date, alkanes: d.diesel + d.alkanesOther, other: d.other }] : []
    }
    case "diesel-tx-share":
      return windowSlice(spreadRows(payload.dieselTxShare), window)
    case "diesel-mints-per-day":
      return windowSlice(spreadRows(payload.dieselMintsPerDay), window)
    case "diesel-mints-cumulative":
      return windowSlice(spreadRows(payload.dieselCumulative), window)
    case "ug-diesel-share":
      return windowSlice(spreadRows(payload.ugDieselShare), window)
    case "ug-mints-per-day":
      return windowSlice(payload.ugMintsPerDay, window)
    case "runes-vs-alkanes-share":
      return windowSlice(payload.runesVsAlkanesShare, window)
    case "runes-vs-alkanes-bytes":
      return windowSlice(payload.runesVsAlkanesBytes, window)
    case "byte-composition":
      return windowSlice(payload.byteComposition, window)
    case "runestone-tx-share":
      return windowSlice(payload.runestoneTxShare, window)
    case "runestone-tx-count":
      return windowSlice(payload.runestoneTxCount, window)
    case "bytes-donut": {
      const c = payload.bytesComposition
      const date = payload.header.lastDate ?? payload.updatedAt ?? ""
      return c ? [{ date, alkanes: c.alkanes, runes: c.runes, other: c.other }] : []
    }
    case "bytes-per-tx":
      return windowSlice(payload.bytesPerTx, window)
    case "miner-revenue-usd":
      return windowSlice(spreadRows(payload.minerRevenueUsd), window)
    case "fees-split-btc":
      return windowSlice(payload.feesSplitBtc, window)
    case "alkanes-fee-share":
      return windowSlice(spreadRows(payload.alkanesFeeShare), window)
    case "fee-per-tx":
      return windowSlice(payload.feePerTx, window)
    default:
      return []
  }
}

export async function GET(req: NextRequest) {
  const params = parseChartParams(req.nextUrl.searchParams)
  if (!params) return new Response("Bad request", { status: 400 })
  const { spec, window, theme } = params
  const dark = theme !== "light"

  // Never throw on a stats failure -- render the frame with an empty plot instead of a 500.
  // getPublicOpReturnData already swallows a listOpReturnDaily failure internally (returns its
  // EMPTY payload); this direct call (only used for the footer's "as of" date, same as the card
  // route) needs its own guard for the same reason.
  let rows: OpReturnRow[] = []
  try {
    rows = await listOpReturnDaily()
  } catch (e) {
    console.error("[chart-route] listOpReturnDaily failed", e)
  }
  const asOf = rows.length ? rows[rows.length - 1].date : null

  const payload = await getPublicOpReturnData()
  const chartRows = resolveRows(spec.id, payload, window)

  const [logo, font] = await Promise.all([loadOgLogomark(), loadOgFont()])

  const bg = dark ? "#0b1220" : "#ffffff"
  const ink = dark ? "#ffffff" : "#071224"
  const muted = dark ? "#aab8d6" : "#51647f"
  const grid = dark ? "#1b2740" : "#eef2f8"

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: bg,
          padding: 72,
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" width={64} height={64} />
          <span style={{ display: "flex", fontSize: 30, letterSpacing: 4, color: muted }}>SUBFROST</span>
          <span style={{ display: "flex", marginLeft: "auto", fontSize: 26, color: muted }}>{WINDOW_LABELS[window]}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
          <div style={{ display: "flex", fontSize: 40, color: ink }}>{spec.title}</div>
          <div style={{ display: "flex" }}>
            <ChartBody spec={spec} rows={chartRows} width={CHART_W} height={CHART_H} ink={ink} muted={muted} grid={grid} />
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 24, color: muted }}>
          subfrost.io/metrics{asOf ? ` · as of ${asOf}` : ""}
        </div>
      </div>
    ),
    { ...SIZE, headers: { "Cache-Control": CACHE }, fonts: [{ name: "Geist", data: font, style: "normal", weight: 500 }] },
  )
}
