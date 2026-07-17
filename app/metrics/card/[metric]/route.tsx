import { ImageResponse } from "next/og"
import { getPublicData, isPublicMetricKey, CARD_METRICS, formatMetricValue, type PublicMetricKey } from "@/lib/marketing/public-data"
import { loadOgLogomark, loadOgFont } from "@/lib/og-assets"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SIZE = { width: 1200, height: 675 }
const BG = "#0b1220"
const INK = "#ffffff"
const MUTED = "#aab8d6"
const ACCENT = "#5dcaa5"
const RED = "#f0997b"

const CACHE = "public, max-age=300, stale-while-revalidate=600"

export async function GET(_req: Request, ctx: { params: Promise<{ metric: string }> }) {
  const { metric } = await ctx.params
  if (!isPublicMetricKey(metric)) {
    return new Response("Not found", { status: 404 })
  }
  const key: PublicMetricKey = metric

  let value: number | null = null
  let deltaPct: number | null = null
  let asOf: string | null = null
  try {
    const data = await getPublicData()
    value = data.now[key] ?? null
    deltaPct = data.deltas7d[key] ?? null
    asOf = data.updatedAt
  } catch (e) {
    console.error("[data/card] payload failed, rendering dash", e)
  }

  const [logo, font] = await Promise.all([loadOgLogomark(), loadOgFont()])
  const { label } = CARD_METRICS[key]
  const deltaText = deltaPct === null ? null : `${deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(deltaPct).toFixed(1)}% · 7d`
  const dateText = asOf ? asOf.slice(0, 10) : ""

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: BG, color: INK, fontFamily: "Geist", padding: 72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" width={56} height={56} />
          <div style={{ display: "flex", fontSize: 34, color: MUTED, letterSpacing: 2 }}>SUBFROST</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", fontSize: 40, color: MUTED }}>{label}</div>
          <div style={{ display: "flex", fontSize: 132, fontWeight: 500, color: INK }}>{formatMetricValue(key, value)}</div>
          {deltaText ? (
            <div style={{ display: "flex", fontSize: 36, color: deltaPct !== null && deltaPct >= 0 ? ACCENT : RED }}>{deltaText}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: MUTED }}>
          <div style={{ display: "flex" }}>subfrost.io/metrics</div>
          <div style={{ display: "flex" }}>{dateText}</div>
        </div>
      </div>
    ),
    { ...SIZE, headers: { "Cache-Control": CACHE }, fonts: [{ name: "Geist", data: font, style: "normal", weight: 500 }] },
  )
}
