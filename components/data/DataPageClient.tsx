"use client"

import { useMemo } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import type { SeriesPoint } from "@/lib/marketing/protocol-series"
import { CARD_METRICS, formatMetricValue, type PublicMetricKey } from "@/lib/marketing/public-data"
import { ShareMenu } from "@/components/share/ShareMenu"

export interface DataCardCopy {
  share: string
  copied: string
  post: string
  sevenDays: string
}

// Token icons shown next to each card label. DIESEL/FIRE/frBTC are the same assets the
// /ecosystem profiles use (CMS bucket); BTC ships in public/. Pairs show both tokens.
const ECO = "https://storage.googleapis.com/subfrost-cms/ecosystem"
const BTC_ICON = "/bitcoin-btc-logo.svg"
const DIESEL_ICON = `${ECO}/cmqlujevl0000tanjvueemeg3-20png-2a346dc0.opt.png`
const FIRE_ICON = `${ECO}/cmqlujevl0000tanjvueemeg3-fire-orangesvg-1210.svg`
const FRBTC_ICON = `${ECO}/cmqlujevl0000tanjvueemeg3-frbtcsvg-7977.svg`
const METRIC_ICONS: Record<PublicMetricKey, string[]> = {
  "btc-locked": [BTC_ICON],
  "frbtc-supply": [FRBTC_ICON],
  "diesel-holders": [DIESEL_ICON],
  "diesel-price": [DIESEL_ICON],
  "diesel-marketcap": [DIESEL_ICON],
  "fire-price": [FIRE_ICON],
}

export function MetricCard({
  metric, value, deltaPct, series, showChart, copy, locale,
}: {
  metric: PublicMetricKey
  value: number | null
  deltaPct: number | null
  series: SeriesPoint[]
  showChart: boolean
  copy: DataCardCopy
  locale: "en" | "zh"
}) {
  const { label, seriesField } = CARD_METRICS[metric]

  const points = useMemo(
    () => series.map((p) => ({ date: p.date, v: p[seriesField] as number | null })).filter((p) => p.v !== null),
    [series, seriesField],
  )

  const cardUrl = `https://subfrost.io/metrics/card/${metric}`
  const shareText = `${label}: ${formatMetricValue(metric, value)} @subfrost_news`

  return (
    // Compact card (~half the previous height): the charts below are the page's emphasis.
    <div className="flex flex-col gap-1.5 rounded-xl border p-4" style={{ borderColor: "var(--ed-hairline, #22304a)", background: "var(--ed-card, transparent)" }}>
      <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--ed-muted)" }}>
        <span className="flex shrink-0 items-center">
          {METRIC_ICONS[metric].map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              width={18}
              height={18}
              loading="lazy"
              decoding="async"
              className={`h-[18px] w-[18px] rounded-full object-cover ${i > 0 ? "-ml-1.5" : ""}`}
            />
          ))}
        </span>
        {label}
      </div>
      <div className="text-[22px] font-medium leading-tight" style={{ color: "var(--ed-ink)" }}>{formatMetricValue(metric, value)}</div>
      {deltaPct !== null ? (
        <div className="text-xs" style={{ color: deltaPct >= 0 ? "#3aa981" : "#c2633f" }}>
          {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}% · {copy.sevenDays}
        </div>
      ) : null}
      {showChart && points.length >= 2 ? (
        <div className="h-[72px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <XAxis dataKey="date" hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip formatter={(v: number) => formatMetricValue(metric, v)} labelStyle={{ color: "#334" }} />
              <Line type="monotone" dataKey="v" stroke="#5dcaa5" strokeWidth={1.8} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      <div className="mt-auto pt-0.5">
        <ShareMenu url={cardUrl} imageUrl={cardUrl} text={shareText} locale={locale} />
      </div>
    </div>
  )
}
