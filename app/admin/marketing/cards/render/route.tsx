import { ImageResponse } from "next/og"
import { NextRequest } from "next/server"
import { currentUser } from "@/lib/cms/authz"
import { listOpReturnDaily } from "@/lib/marketing/opreturn-store"
import { computeMetric, computeBytesComposition, formatMetricValue } from "@/lib/marketing/opreturn-metrics"
import { METRIC_LABELS, WINDOW_LABELS, type MetricKey, type WindowKey } from "@/lib/marketing/opreturn-types"
import { loadOgLogomark, loadOgFont } from "@/lib/og-assets"

export const runtime = "nodejs"
const SIZE = { width: 1200, height: 675 }

async function assets() {
  const [logo, font] = await Promise.all([loadOgLogomark(), loadOgFont()])
  return { logo, font }
}

const fmtPct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`)

function sparkline(series: { value: number | null }[], stroke: string) {
  const pts = series.filter((p) => p.value !== null) as { value: number }[]
  if (pts.length < 2) return null
  const max = Math.max(...pts.map((p) => p.value)), min = Math.min(...pts.map((p) => p.value))
  const span = max - min || 1
  const w = 900, h = 120
  const d = pts.map((p, i) => `${(i / (pts.length - 1)) * w},${h - ((p.value - min) / span) * h}`).join(" ")
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "flex" }}>
      <polyline points={d} fill="none" stroke={stroke} strokeWidth={5} />
    </svg>
  )
}

export async function GET(req: NextRequest) {
  const me = await currentUser()
  if (!me || !me.privileges.includes("marketing.view")) return new Response("Unauthorized", { status: 401 })

  const sp = req.nextUrl.searchParams
  const metric = (sp.get("metric") ?? "alkanesTxShare") as MetricKey
  const template = sp.get("template") === "compare" ? "compare" : "hero"
  const window = (sp.get("window") ?? "avg7") as WindowKey
  const dark = sp.get("theme") !== "light"

  const rows = await listOpReturnDaily()
  const { logo, font } = await assets()
  const bg = dark ? "#0b1220" : "#ffffff"
  const ink = dark ? "#ffffff" : "#071224"
  const muted = dark ? "#aab8d6" : "#51647f"
  const accent = "#5dcaa5"

  let inner: React.ReactNode
  if (template === "compare") {
    const c = computeBytesComposition(rows, window)
    const bar = (label: string, v: number, color: string) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: ink }}><span>{label}</span><span>{fmtPct(v)}</span></div>
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
  } else {
    const { value, format, series } = computeMetric(rows, metric, window)
    inner = (
      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        <div style={{ display: "flex", fontSize: 150, fontWeight: 500, color: ink, lineHeight: 1 }}>{formatMetricValue(value, format)}</div>
        <div style={{ display: "flex", fontSize: 38, color: muted, marginTop: 14 }}>{METRIC_LABELS[metric]}</div>
        <div style={{ display: "flex", marginTop: 24 }}>{sparkline(series, accent)}</div>
      </div>
    )
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: bg, padding: 72, fontFamily: "Geist" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" width={64} height={64} />
          <span style={{ display: "flex", fontSize: 30, letterSpacing: 4, color: muted }}>SUBFROST</span>
          <span style={{ display: "flex", marginLeft: "auto", fontSize: 26, color: muted }}>{WINDOW_LABELS[window]}</span>
        </div>
        <div style={{ display: "flex" }}>{inner}</div>
        <div style={{ display: "flex", fontSize: 24, color: muted }}>subfrost.io · decoded from Bitcoin OP_RETURN, daily</div>
      </div>
    ),
    { ...SIZE, fonts: [{ name: "Geist", data: font, style: "normal", weight: 500 }] },
  )
}
