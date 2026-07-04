"use client"

import { useMemo, useState } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import type { SeriesPoint } from "@/lib/marketing/protocol-series"
import { CARD_METRICS, formatMetricValue, type PublicMetricKey } from "@/lib/marketing/public-data"

export interface DataCardCopy {
  share: string
  copied: string
  post: string
  sevenDays: string
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
  const [copied, setCopied] = useState(false)
  const { label, seriesField } = CARD_METRICS[metric]

  const points = useMemo(
    () => series.map((p) => ({ date: p.date, v: p[seriesField] as number | null })).filter((p) => p.v !== null),
    [series, seriesField],
  )

  const cardUrl = `https://subfrost.io/metrics/card/${metric}`
  const pageUrl = `https://subfrost.io/metrics${locale === "zh" ? "?lang=zh" : ""}`
  const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${label}: ${formatMetricValue(metric, value)} @subfrost_news`)}&url=${encodeURIComponent(pageUrl)}`

  async function copyCard() {
    try {
      await navigator.clipboard.writeText(cardUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard denied: no-op */ }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-6" style={{ borderColor: "var(--ed-hairline, #22304a)", background: "var(--ed-card, transparent)" }}>
      <div className="text-sm" style={{ color: "var(--ed-muted)" }}>{label}</div>
      <div className="text-3xl font-medium" style={{ color: "var(--ed-ink)" }}>{formatMetricValue(metric, value)}</div>
      {deltaPct !== null ? (
        <div className="text-sm" style={{ color: deltaPct >= 0 ? "#3aa981" : "#c2633f" }}>
          {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}% · {copy.sevenDays}
        </div>
      ) : null}
      {showChart && points.length >= 2 ? (
        <div className="h-[160px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={32} />
              <YAxis tick={{ fontSize: 11 }} width={64} domain={["auto", "auto"]} />
              <Tooltip formatter={(v: number) => formatMetricValue(metric, v)} labelStyle={{ color: "#334" }} />
              <Line type="monotone" dataKey="v" stroke="#5dcaa5" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      <div className="mt-auto flex gap-3 text-sm">
        <button type="button" onClick={copyCard} className="rounded-full border px-4 py-1.5" style={{ borderColor: "var(--ed-hairline, #22304a)", color: "var(--ed-ink)" }}>
          {copied ? copy.copied : copy.share}
        </button>
        <a href={tweet} target="_blank" rel="noopener noreferrer" className="rounded-full border px-4 py-1.5" style={{ borderColor: "var(--ed-hairline, #22304a)", color: "var(--ed-ink)" }}>
          {copy.post}
        </a>
      </div>
    </div>
  )
}
