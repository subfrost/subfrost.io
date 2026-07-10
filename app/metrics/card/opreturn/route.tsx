import { ImageResponse } from "next/og"
import { NextRequest } from "next/server"
import { listOpReturnDaily } from "@/lib/marketing/opreturn-store"
import { computeMetric, computeBytesComposition, formatMetricValue } from "@/lib/marketing/opreturn-metrics"
import { METRIC_LABELS, WINDOW_LABELS, type MetricKey } from "@/lib/marketing/opreturn-types"
import { parseCardParams } from "@/lib/marketing/opreturn-card"
import { loadOgLogomark, loadOgFont } from "@/lib/og-assets"

// Public, un-gated copy of the admin Stat Card studio renderer — the shareable
// OP_RETURN cards on /metrics link here. Params are enum-validated (see
// parseCardParams) so the URL space is finite and fully CDN-cacheable, and no
// free-text ever reaches the branded image. Analyst-subtle: the source + as-of
// date are printed on the card so a screenshot always carries its citation.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SIZE = { width: 1200, height: 675 }
const CACHE = "public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400"

// Curated N-stat card — the flagship's "Three answers" (miner fees deliberately out of the overview).
// A generic list so future multi-stat cards reuse the template; keep ids/labels stable (embed contract).
// Embed contract: existing `?template=answers` embeds render exactly this stat set forever. If the
// stats ever need to change, mint a NEW template id (e.g. "answers2") — do NOT edit this list in place,
// since that would silently change the meaning of embeds already published/cached elsewhere.
const SHARE_OF_BITCOIN_STATS: { metric: MetricKey; label: string }[] = [
  { metric: "alkanesTxShare", label: "of transactions" },
  { metric: "alkanesWeightShare", label: "of block weight" },
  { metric: "alkanesBytesShare", label: "of OP_RETURN bytes" },
]

const fmtPct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`)

function sparkline(series: { value: number | null }[], stroke: string) {
  const pts = series.filter((p) => p.value !== null) as { value: number }[]
  if (pts.length < 2) return null
  const max = Math.max(...pts.map((p) => p.value)),
    min = Math.min(...pts.map((p) => p.value))
  const span = max - min || 1
  const w = 900,
    h = 120
  const d = pts.map((p, i) => `${(i / (pts.length - 1)) * w},${h - ((p.value - min) / span) * h}`).join(" ")
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "flex" }}>
      <polyline points={d} fill="none" stroke={stroke} strokeWidth={5} />
    </svg>
  )
}

export async function GET(req: NextRequest) {
  const params = parseCardParams(req.nextUrl.searchParams)
  if (!params) return new Response("Bad request", { status: 400 })
  const { metric, template, window, theme } = params
  const dark = theme !== "light"

  const rows = await listOpReturnDaily()
  const asOf = rows.length ? rows[rows.length - 1].date : null
  const [logo, font] = await Promise.all([loadOgLogomark(), loadOgFont()])

  const bg = dark ? "#0b1220" : "#ffffff"
  const ink = dark ? "#ffffff" : "#071224"
  const muted = dark ? "#aab8d6" : "#51647f"
  const accent = "#5dcaa5"

  let inner: React.ReactNode
  if (template === "compare") {
    const c = computeBytesComposition(rows, window)
    const bar = (label: string, v: number, color: string) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: ink }}>
          <span>{label}</span>
          <span>{fmtPct(v)}</span>
        </div>
        <div style={{ display: "flex", width: "100%", height: 28, background: dark ? "#1b2740" : "#eef2f8" }}>
          <div style={{ display: "flex", width: `${Math.round(v * 100)}%`, height: 28, background: color }} />
        </div>
      </div>
    )
    inner = (
      <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
        <div style={{ display: "flex", fontSize: 40, color: ink }}>OP_RETURN bytes composition</div>
        {bar("Alkanes", c.alkanes, accent)}
        {bar("Other Runes", c.runes, "#a7ddca")}
        {bar("Non-Runes OP_RETURN", c.other, muted)}
      </div>
    )
  } else if (template === "answers") {
    inner = (
      <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
        <div style={{ display: "flex", fontSize: 40, color: ink }}>How much of Bitcoin is Alkanes?</div>
        {SHARE_OF_BITCOIN_STATS.map((s) => {
          const { value, format } = computeMetric(rows, s.metric, window)
          return (
            <div key={s.metric} style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
              <span style={{ display: "flex", fontSize: 76, fontWeight: 500, color: ink, lineHeight: 1 }}>{formatMetricValue(value, format)}</span>
              <span style={{ display: "flex", fontSize: 32, color: muted }}>{s.label}</span>
            </div>
          )
        })}
      </div>
    )
  } else {
    const { value, format, series } = computeMetric(rows, metric, window)
    inner = (
      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        <div style={{ display: "flex", fontSize: 150, fontWeight: 500, color: ink, lineHeight: 1 }}>
          {formatMetricValue(value, format)}
        </div>
        <div style={{ display: "flex", fontSize: 38, color: muted, marginTop: 14 }}>{METRIC_LABELS[metric]}</div>
        <div style={{ display: "flex", marginTop: 24 }}>{sparkline(series, accent)}</div>
      </div>
    )
  }

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
        <div style={{ display: "flex" }}>{inner}</div>
        <div style={{ display: "flex", fontSize: 24, color: muted }}>
          subfrost.io/metrics{asOf ? ` · as of ${asOf}` : ""}
        </div>
      </div>
    ),
    { ...SIZE, headers: { "Cache-Control": CACHE }, fonts: [{ name: "Geist", data: font, style: "normal", weight: 500 }] },
  )
}
