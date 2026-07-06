"use client"

import { useMemo, useState } from "react"
import {
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts"
import type { Payload as LegendPayload } from "recharts/types/component/DefaultLegendContent"
import type { PublicOpReturnPayload, OpReturnPoint } from "@/lib/marketing/public-opreturn"

export interface OpReturnCopy {
  title: string
  note: string
  noteLink: string
  reproduce: string
  reproduceData: string
  updated: string
  subHeader: string
  windowAll: string
  window60: string
  windowYtd: string
  legendTip: string
  howTitle: string
  how: string[]
  charts: {
    dailyShare: { title: string; series: { txShare: string; opReturnPenetration: string }; desc: string }
    opReturnShare: { title: string; series: { txPct: string; bytesPct: string }; desc: string }
    latestDonut: { title: string; series: { alkanes: string; other: string }; desc: string }
    weightShare: { title: string; desc: string }
    dieselTxShare: { title: string; desc: string }
    bytesDonut: { title: string; desc: string; series: { alkanes: string; runes: string; other: string } }
    bytesPerTx: { title: string; series: { alkanes: string; rest: string }; desc: string }
    minerRevenueUsd: { title: string; desc: string }
    ugDieselShare: { title: string; desc: string }
    feesSplitBtc: { title: string; series: { alkanes: string; rest: string }; desc: string }
    alkanesFeeShare: { title: string; desc: string }
    fourAnswers: { title: string; desc: string; series: { byTx: string; byBytes: string; byWeight: string; byFee: string } }
    dieselMintsPerDay: { title: string; desc: string }
    dieselCumulative: { title: string; desc: string }
    feePerTx: { title: string; desc: string; series: { alkanes: string; rest: string } }
    ugMintsPerDay: { title: string; desc: string; series: { diesel: string; independent: string } }
    runesVsAlkanesShare: { title: string; desc: string; series: { alkanes: string; pureRunes: string } }
    runesVsAlkanesBytes: { title: string; desc: string; series: { alkanes: string; pureRunes: string } }
    byteComposition: { title: string; desc: string; series: { alkanes: string; pureRunes: string; other: string } }
    runestoneTxShare: { title: string; desc: string; series: { alkanes: string; pureRunes: string } }
    runestoneTxCount: { title: string; desc: string; series: { alkanes: string; pureRunes: string } }
  }
}

const ACCENT = "#5dcaa5"
const SECOND = "#f0997b"
const MUTED = "#aab8d6"
const FOURTH = "#d9a441" // amber — 4th line in the "four answers" overlay
const SLICE_OTHER = "#4a4a52"
const HAIRLINE = "var(--ed-hairline, #22304a)"

/** Replaces every {token} in `template` with values[token]; missing/null values render "—". */
function fill(template: string, values: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = values[key]
    return v === null || v === undefined ? "—" : String(v)
  })
}

const fmtPct = (v: number | null | undefined): string => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`)
const fmtNum = (v: number | null | undefined): string => (v === null || v === undefined ? "—" : v.toLocaleString("en-US"))
const fmtBytesPerTx = (v: number | null | undefined): string => (v === null || v === undefined ? "—" : `~${v.toFixed(1)}`)

const axisPct = (v: number) => `${Math.round(v * 100)}%`
const axisBtc = (v: number) => `${v.toFixed(2)} BTC`
const axisBytes = (v: number) => {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}GB`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}MB`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}KB`
  return `${Math.round(v)}B`
}
const axisUsdCompact = (v: number) => {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${Math.round(v)}`
}
const axisNumCompact = (v: number) => {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return `${Math.round(v)}`
}
const tooltipPct = (v: number) => `${(v * 100).toFixed(2)}%`
const tooltipBtc = (v: number) => `${v.toFixed(4)} BTC`
const tooltipUsd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`
const tooltipBytesPerTx = (v: number) => `${v.toFixed(1)} B`
const tooltipNum = (v: number) => Math.round(v).toLocaleString("en-US")
const tooltipSats = (v: number) => `${Math.round(v).toLocaleString("en-US")} sats`
const tooltipBytes = (v: number) => axisBytes(v)

function fmtDate(iso: string, locale: "en" | "zh"): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d)
}

function Card({ title, children, desc }: { title: string; children: React.ReactNode; desc?: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-6" style={{ borderColor: HAIRLINE, background: "var(--ed-card, transparent)" }}>
      <div className="text-sm" style={{ color: "var(--ed-muted)" }}>{title}</div>
      {children}
      {desc ? <p className="text-xs leading-relaxed" style={{ color: "var(--ed-muted)" }}>{desc}</p> : null}
    </div>
  )
}

/**
 * Shared multi-line/area chart with recharts Legend onClick toggling.
 * Series with a single key render without a Legend (nothing to toggle).
 */
function ToggleLineChart({
  data, seriesKeys, colors, dashed, yTickFormatter, tooltipFormatter, area = false, stacked = false, logScale = false, tip,
}: {
  data: Record<string, unknown>[]
  seriesKeys: { key: string; label: string }[]
  colors: Record<string, string>
  dashed?: Record<string, boolean>
  yTickFormatter: (v: number) => string
  tooltipFormatter: (v: number) => string
  area?: boolean
  stacked?: boolean
  logScale?: boolean
  tip?: string
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const showLegend = seriesKeys.length > 1
  const ChartTag = area ? AreaChart : LineChart
  // A log axis can't plot 0 or negatives — drop them to null so the line just skips those days.
  const plotData = logScale
    ? data.map((d) => {
        const o = { ...d }
        for (const { key } of seriesKeys) o[key] = typeof d[key] === "number" && (d[key] as number) > 0 ? d[key] : null
        return o
      })
    : data

  function onLegendClick(entry: LegendPayload) {
    const key = entry.dataKey
    if (typeof key !== "string") return
    setHidden((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ChartTag data={plotData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
            <YAxis
              tick={{ fontSize: 11 }}
              width={72}
              tickFormatter={yTickFormatter}
              scale={logScale ? "log" : "auto"}
              domain={logScale ? [1, "auto"] : ["auto", "auto"]}
              allowDataOverflow={logScale}
            />
            <Tooltip formatter={(v: number) => tooltipFormatter(v)} labelStyle={{ color: "#334" }} />
            {showLegend ? (
              <Legend onClick={onLegendClick} wrapperStyle={{ fontSize: 12, cursor: "pointer" }} />
            ) : null}
            {seriesKeys.map(({ key, label }) =>
              area ? (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={label}
                  stackId={stacked ? "s" : undefined}
                  stroke={colors[key]}
                  fill={colors[key]}
                  fillOpacity={stacked ? 0.4 : 0.18}
                  strokeWidth={2}
                  hide={hidden[key]}
                  isAnimationActive={false}
                  connectNulls
                />
              ) : (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={label}
                  stroke={colors[key]}
                  strokeDasharray={dashed?.[key] ? "4 3" : undefined}
                  strokeWidth={2}
                  dot={false}
                  hide={hidden[key]}
                  isAnimationActive={false}
                  connectNulls
                />
              ),
            )}
          </ChartTag>
        </ResponsiveContainer>
      </div>
      {showLegend && tip ? <p className="text-xs" style={{ color: "var(--ed-muted)" }}>{tip}</p> : null}
    </div>
  )
}

function SingleLineChart({
  data, dataKey, color, yTickFormatter, tooltipFormatter, area = false, logScale = false,
}: {
  data: OpReturnPoint[]
  dataKey: "value"
  color: string
  yTickFormatter: (v: number) => string
  tooltipFormatter: (v: number) => string
  area?: boolean
  logScale?: boolean
}) {
  const ChartTag = area ? AreaChart : LineChart
  // A log axis can't plot 0 or negatives — drop them to null so the line just skips those days.
  const plotData = logScale ? data.map((d) => ({ ...d, value: d.value != null && d.value > 0 ? d.value : null })) : data
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ChartTag data={plotData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis
            tick={{ fontSize: 11 }}
            width={72}
            tickFormatter={yTickFormatter}
            scale={logScale ? "log" : "auto"}
            domain={logScale ? [1, "auto"] : ["auto", "auto"]}
            allowDataOverflow={logScale}
          />
          <Tooltip formatter={(v: number) => tooltipFormatter(v)} labelStyle={{ color: "#334" }} />
          {area ? (
            <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} connectNulls />
          ) : (
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
          )}
        </ChartTag>
      </ResponsiveContainer>
    </div>
  )
}

type WindowMode = "all" | "60d" | "ytd"

/**
 * Applies the selected window to a date-keyed series:
 * "all" → everything · "60d" → last 60 rows · "ytd" → rows dated on/after Jan 1 of `year`.
 */
function applyWindow<T extends { date: string }>(arr: T[], mode: WindowMode, year: number): T[] {
  if (mode === "60d") return arr.slice(-60)
  if (mode === "ytd") {
    const start = `${year}-01-01`
    return arr.filter((r) => r.date >= start)
  }
  return arr
}

/**
 * Pie/donut with a legend built client-side from fractions, formatted "Label NN.N%"
 * (or "Label NN%" when decimals=0) — matching the original dashboard's static legend.
 */
function LabeledPie({
  slices, innerRadius, height,
}: {
  slices: { name: string; value: number; color: string; pct: string }[]
  innerRadius?: number
  height: number
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              innerRadius={innerRadius}
              outerRadius={innerRadius ? innerRadius + 25 : Math.min(80, height / 2 - 10)}
              // Start at 12 o'clock and sweep clockwise like the original dashboard (Chart.js
              // convention) — puts the small trailing slice at the top instead of the left.
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => v.toLocaleString("en-US")} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-4 text-xs" style={{ color: "var(--ed-muted)" }}>
        {slices.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.name} {s.pct}%
          </span>
        ))}
      </div>
    </div>
  )
}

export function OpReturnCharts({ payload, copy, locale }: { payload: PublicOpReturnPayload; copy: OpReturnCopy; locale: "en" | "zh" }) {
  const [windowMode, setWindowMode] = useState<WindowMode>("all")
  const year = useMemo(() => new Date().getUTCFullYear(), [])

  const dailyShare = useMemo(() => applyWindow(payload.dailyShare, windowMode, year), [payload.dailyShare, windowMode, year])
  const opReturnShare = useMemo(() => applyWindow(payload.opReturnShare, windowMode, year), [payload.opReturnShare, windowMode, year])
  const weightShare = useMemo(() => applyWindow(payload.weightShare, windowMode, year), [payload.weightShare, windowMode, year])
  const dieselTxShare = useMemo(() => applyWindow(payload.dieselTxShare, windowMode, year), [payload.dieselTxShare, windowMode, year])
  const bytesPerTx = useMemo(() => applyWindow(payload.bytesPerTx, windowMode, year), [payload.bytesPerTx, windowMode, year])
  const minerRevenueUsd = useMemo(() => applyWindow(payload.minerRevenueUsd, windowMode, year), [payload.minerRevenueUsd, windowMode, year])
  const ugDieselShare = useMemo(() => applyWindow(payload.ugDieselShare, windowMode, year), [payload.ugDieselShare, windowMode, year])
  const feesSplitBtc = useMemo(() => applyWindow(payload.feesSplitBtc, windowMode, year), [payload.feesSplitBtc, windowMode, year])
  const alkanesFeeShare = useMemo(() => applyWindow(payload.alkanesFeeShare, windowMode, year), [payload.alkanesFeeShare, windowMode, year])
  const fourAnswers = useMemo(() => applyWindow(payload.fourAnswers, windowMode, year), [payload.fourAnswers, windowMode, year])
  const dieselMintsPerDay = useMemo(() => applyWindow(payload.dieselMintsPerDay, windowMode, year), [payload.dieselMintsPerDay, windowMode, year])
  const dieselCumulative = useMemo(() => applyWindow(payload.dieselCumulative, windowMode, year), [payload.dieselCumulative, windowMode, year])
  const feePerTx = useMemo(() => applyWindow(payload.feePerTx, windowMode, year), [payload.feePerTx, windowMode, year])
  const ugMintsPerDay = useMemo(() => applyWindow(payload.ugMintsPerDay, windowMode, year), [payload.ugMintsPerDay, windowMode, year])
  const runesVsAlkanesShare = useMemo(() => applyWindow(payload.runesVsAlkanesShare, windowMode, year), [payload.runesVsAlkanesShare, windowMode, year])
  const runesVsAlkanesBytes = useMemo(() => applyWindow(payload.runesVsAlkanesBytes, windowMode, year), [payload.runesVsAlkanesBytes, windowMode, year])
  const byteComposition = useMemo(() => applyWindow(payload.byteComposition, windowMode, year), [payload.byteComposition, windowMode, year])
  const runestoneTxShare = useMemo(() => applyWindow(payload.runestoneTxShare, windowMode, year), [payload.runestoneTxShare, windowMode, year])
  const runestoneTxCount = useMemo(() => applyWindow(payload.runestoneTxCount, windowMode, year), [payload.runestoneTxCount, windowMode, year])

  if (payload.days === 0) return null
  const donut = payload.latestDonut
  const bytesComposition = payload.bytesComposition
  const { header, stats } = payload

  const subHeader = fill(copy.subHeader, {
    firstDate: header.firstDate ? fmtDate(header.firstDate, locale) : "—",
    lastDate: header.lastDate ? fmtDate(header.lastDate, locale) : "—",
    days: payload.days.toLocaleString(locale === "zh" ? "zh-CN" : "en-US"),
    totalTx: header.totalTxSampled.toLocaleString(locale === "zh" ? "zh-CN" : "en-US"),
  })

  // Last-day pie: 2 slices, Alkanes = diesel + alkanesOther, Other OP_RETURN = other (combined client-side).
  const donutTotal = donut ? donut.diesel + donut.alkanesOther + donut.other : 0
  const donutAlkanes = donut ? donut.diesel + donut.alkanesOther : 0
  const donutAlkanesPctInt = donut && donutTotal > 0 ? Math.round((donutAlkanes / donutTotal) * 100) : null
  const donutOtherPctInt = donut && donutTotal > 0 ? Math.round((donut.other / donutTotal) * 100) : null

  return (
    <section className="mt-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-medium" style={{ color: "var(--ed-ink)" }}>{copy.title}</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--ed-muted)" }}>{subHeader}</p>
        </div>
        <div className="flex gap-2">
          {([
            ["all", copy.windowAll],
            ["60d", copy.window60],
            ["ytd", copy.windowYtd],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setWindowMode(mode)}
              className="rounded-full border px-4 py-1.5 text-sm"
              style={{
                borderColor: HAIRLINE,
                color: windowMode === mode ? "#04150f" : "var(--ed-ink)",
                background: windowMode === mode ? ACCENT : "transparent",
                fontWeight: windowMode === mode ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--ed-muted)" }}>
        {copy.note}{" "}
        <a href="https://github.com/Vdto88/alkanes-opreturn-stats" target="_blank" rel="noopener noreferrer" className="underline">
          {copy.noteLink}
        </a>
      </p>
      <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--ed-muted)" }}>
        {copy.reproduce}{" "}
        <a href="https://github.com/Vdto88/alkanes-opreturn-decoder" target="_blank" rel="noopener noreferrer" className="underline">
          alkanes-opreturn-decoder
        </a>
        {" · "}
        <a href="https://github.com/Vdto88/alkanes-opreturn-scanner" target="_blank" rel="noopener noreferrer" className="underline">
          alkanes-opreturn-scanner
        </a>
        {" · "}
        <a href="https://github.com/Vdto88/alkanes-opreturn-stats" target="_blank" rel="noopener noreferrer" className="underline">
          {copy.reproduceData}
        </a>
      </p>

      {/* 2 columns max — the charts are the emphasis of the page (bigger, easier to read). */}
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {/* 1. Daily Alkanes share */}
        <Card title={copy.charts.dailyShare.title} desc={copy.charts.dailyShare.desc}>
          <ToggleLineChart
            data={dailyShare}
            seriesKeys={[
              { key: "txShare", label: copy.charts.dailyShare.series.txShare },
              { key: "opReturnPenetration", label: copy.charts.dailyShare.series.opReturnPenetration },
            ]}
            colors={{ txShare: ACCENT, opReturnPenetration: MUTED }}
            dashed={{ opReturnPenetration: true }}
            yTickFormatter={axisPct}
            tooltipFormatter={tooltipPct}
            tip={copy.legendTip}
          />
        </Card>

        {/* 2. Alkanes' share of OP_RETURN */}
        <Card title={copy.charts.opReturnShare.title} desc={fill(copy.charts.opReturnShare.desc, {
          txPct30: fmtPct(stats.last30.alkanesOfOpReturnTx),
          bytesPct30: fmtPct(stats.last30.alkanesOfOpReturnBytes),
        })}>
          <ToggleLineChart
            data={opReturnShare}
            seriesKeys={[
              { key: "txPct", label: copy.charts.opReturnShare.series.txPct },
              { key: "bytesPct", label: copy.charts.opReturnShare.series.bytesPct },
            ]}
            colors={{ txPct: ACCENT, bytesPct: SECOND }}
            yTickFormatter={axisPct}
            tooltipFormatter={tooltipPct}
            tip={copy.legendTip}
          />
        </Card>

        {/* 3. Alkanes' share of block space (by weight) */}
        <Card title={copy.charts.weightShare.title} desc={fill(copy.charts.weightShare.desc, {
          weightShareFull: fmtPct(stats.weight.full),
          weightShareLatest: fmtPct(stats.weight.latest),
        })}>
          <SingleLineChart data={weightShare} dataKey="value" color={ACCENT} yTickFormatter={axisPct} tooltipFormatter={tooltipPct} area />
        </Card>

        {/* How much of Bitcoin is Alkanes? Four answers (tx / OP_RETURN bytes / weight / fee revenue) */}
        <Card title={copy.charts.fourAnswers.title} desc={copy.charts.fourAnswers.desc}>
          <ToggleLineChart
            data={fourAnswers}
            seriesKeys={[
              { key: "byTx", label: copy.charts.fourAnswers.series.byTx },
              { key: "byBytes", label: copy.charts.fourAnswers.series.byBytes },
              { key: "byWeight", label: copy.charts.fourAnswers.series.byWeight },
              { key: "byFee", label: copy.charts.fourAnswers.series.byFee },
            ]}
            colors={{ byTx: ACCENT, byBytes: SECOND, byWeight: MUTED, byFee: FOURTH }}
            yTickFormatter={axisPct}
            tooltipFormatter={tooltipPct}
            tip={copy.legendTip}
          />
        </Card>

        {/* 4. Last day — full pie, 2 slices (Alkanes vs Other OP_RETURN) */}
        {donut ? (
          <Card
            title={copy.charts.latestDonut.title}
            desc={fill(copy.charts.latestDonut.desc, {
              lastDate: stats.latest ? fmtDate(stats.latest.date, locale) : "—",
              fromHeight: stats.latest ? fmtNum(stats.latest.fromHeight) : "—",
              toHeight: stats.latest ? fmtNum(stats.latest.toHeight) : "—",
              blocks: stats.latest ? fmtNum(stats.latest.blocksScanned) : "—",
              opRetTx: stats.latest ? fmtNum(stats.latest.txWithOpReturn) : "—",
              alkTx: stats.latest ? fmtNum(stats.latest.txAlkanes) : "—",
              pct: stats.latest ? fmtPct(stats.latest.alkanesOfOpReturnTx) : "—",
            })}
          >
            <LabeledPie
              height={220}
              slices={[
                { name: copy.charts.latestDonut.series.alkanes, value: donutAlkanes, color: ACCENT, pct: donutAlkanesPctInt === null ? "—" : String(donutAlkanesPctInt) },
                { name: copy.charts.latestDonut.series.other, value: donut.other, color: SLICE_OTHER, pct: donutOtherPctInt === null ? "—" : String(donutOtherPctInt) },
              ]}
            />
          </Card>
        ) : null}

        {/* 5. DIESEL mints share of all tx */}
        <Card title={copy.charts.dieselTxShare.title} desc={copy.charts.dieselTxShare.desc}>
          <SingleLineChart data={dieselTxShare} dataKey="value" color={SECOND} yTickFormatter={axisPct} tooltipFormatter={tooltipPct} area />
        </Card>

        {/* DIESEL mints per day — the birth curve (log scale) */}
        <Card title={copy.charts.dieselMintsPerDay.title} desc={copy.charts.dieselMintsPerDay.desc}>
          <SingleLineChart data={dieselMintsPerDay} dataKey="value" color={SECOND} yTickFormatter={axisNumCompact} tooltipFormatter={tooltipNum} logScale />
        </Card>

        {/* DIESEL minted — cumulative since genesis */}
        <Card title={copy.charts.dieselCumulative.title} desc={copy.charts.dieselCumulative.desc}>
          <SingleLineChart data={dieselCumulative} dataKey="value" color={ACCENT} yTickFormatter={axisNumCompact} tooltipFormatter={tooltipNum} area />
        </Card>

        {/* 6. UNCOMMON•GOODS mints that are DIESEL */}
        <Card title={copy.charts.ugDieselShare.title} desc={fill(copy.charts.ugDieselShare.desc, {
          ugShareEarly: fmtPct(stats.ug.early30),
          ugShareRecent: fmtPct(stats.ug.last30),
          ugShareFull: fmtPct(stats.ug.full),
        })}>
          <SingleLineChart data={ugDieselShare} dataKey="value" color={ACCENT} yTickFormatter={axisPct} tooltipFormatter={tooltipPct} area />
        </Card>

        {/* UNCOMMON•GOODS mints per day — taken over by DIESEL (stacked, raw sampled counts) */}
        <Card title={copy.charts.ugMintsPerDay.title} desc={copy.charts.ugMintsPerDay.desc}>
          <ToggleLineChart
            data={ugMintsPerDay}
            seriesKeys={[
              { key: "diesel", label: copy.charts.ugMintsPerDay.series.diesel },
              { key: "independent", label: copy.charts.ugMintsPerDay.series.independent },
            ]}
            colors={{ diesel: SECOND, independent: MUTED }}
            yTickFormatter={axisNumCompact}
            tooltipFormatter={tooltipNum}
            area
            stacked
            tip={copy.legendTip}
          />
        </Card>

        {/* Runes (non-Alkanes) vs Alkanes — share of OP_RETURN bytes (%) */}
        <Card title={copy.charts.runesVsAlkanesShare.title} desc={copy.charts.runesVsAlkanesShare.desc}>
          <ToggleLineChart
            data={runesVsAlkanesShare}
            seriesKeys={[
              { key: "alkanes", label: copy.charts.runesVsAlkanesShare.series.alkanes },
              { key: "pureRunes", label: copy.charts.runesVsAlkanesShare.series.pureRunes },
            ]}
            colors={{ alkanes: ACCENT, pureRunes: SECOND }}
            yTickFormatter={axisPct}
            tooltipFormatter={tooltipPct}
            tip={copy.legendTip}
          />
        </Card>

        {/* Runes (non-Alkanes) vs Alkanes — absolute bytes per day (log scale) */}
        <Card title={copy.charts.runesVsAlkanesBytes.title} desc={copy.charts.runesVsAlkanesBytes.desc}>
          <ToggleLineChart
            data={runesVsAlkanesBytes}
            seriesKeys={[
              { key: "alkanes", label: copy.charts.runesVsAlkanesBytes.series.alkanes },
              { key: "pureRunes", label: copy.charts.runesVsAlkanesBytes.series.pureRunes },
            ]}
            colors={{ alkanes: ACCENT, pureRunes: SECOND }}
            yTickFormatter={axisBytes}
            tooltipFormatter={tooltipBytes}
            logScale
            tip={copy.legendTip}
          />
        </Card>

        {/* OP_RETURN byte composition over time (stacked %) — the temporal view of the since-genesis donut */}
        <Card title={copy.charts.byteComposition.title} desc={copy.charts.byteComposition.desc}>
          <ToggleLineChart
            data={byteComposition}
            seriesKeys={[
              { key: "alkanes", label: copy.charts.byteComposition.series.alkanes },
              { key: "pureRunes", label: copy.charts.byteComposition.series.pureRunes },
              { key: "other", label: copy.charts.byteComposition.series.other },
            ]}
            colors={{ alkanes: ACCENT, pureRunes: SECOND, other: SLICE_OTHER }}
            yTickFormatter={axisPct}
            tooltipFormatter={tooltipPct}
            area
            stacked
            tip={copy.legendTip}
          />
        </Card>

        {/* Runestone transactions — Alkanes protostones vs Runes (non-Alkanes) (share %) */}
        <Card title={copy.charts.runestoneTxShare.title} desc={copy.charts.runestoneTxShare.desc}>
          <ToggleLineChart
            data={runestoneTxShare}
            seriesKeys={[
              { key: "alkanes", label: copy.charts.runestoneTxShare.series.alkanes },
              { key: "pureRunes", label: copy.charts.runestoneTxShare.series.pureRunes },
            ]}
            colors={{ alkanes: ACCENT, pureRunes: SECOND }}
            yTickFormatter={axisPct}
            tooltipFormatter={tooltipPct}
            tip={copy.legendTip}
          />
        </Card>

        {/* Runestone transactions per day — Alkanes vs Runes (non-Alkanes) (count, log scale) */}
        <Card title={copy.charts.runestoneTxCount.title} desc={copy.charts.runestoneTxCount.desc}>
          <ToggleLineChart
            data={runestoneTxCount}
            seriesKeys={[
              { key: "alkanes", label: copy.charts.runestoneTxCount.series.alkanes },
              { key: "pureRunes", label: copy.charts.runestoneTxCount.series.pureRunes },
            ]}
            colors={{ alkanes: ACCENT, pureRunes: SECOND }}
            yTickFormatter={axisNumCompact}
            tooltipFormatter={tooltipNum}
            logScale
            tip={copy.legendTip}
          />
        </Card>

        {/* 7. OP_RETURN bytes (since DIESEL genesis) — donut, fixed composition */}
        {bytesComposition ? (
          <Card title={copy.charts.bytesDonut.title} desc={copy.charts.bytesDonut.desc}>
            <LabeledPie
              height={230}
              innerRadius={55}
              slices={[
                { name: copy.charts.bytesDonut.series.alkanes, value: bytesComposition.alkanes, color: ACCENT, pct: (bytesComposition.alkanes * 100).toFixed(1) },
                { name: copy.charts.bytesDonut.series.runes, value: bytesComposition.runes, color: SECOND, pct: (bytesComposition.runes * 100).toFixed(1) },
                { name: copy.charts.bytesDonut.series.other, value: bytesComposition.other, color: SLICE_OTHER, pct: (bytesComposition.other * 100).toFixed(1) },
              ]}
            />
          </Card>
        ) : null}

        {/* 8. OP_RETURN bytes per tx */}
        <Card title={copy.charts.bytesPerTx.title} desc={fill(copy.charts.bytesPerTx.desc, {
          bytesPerTx: fmtBytesPerTx(stats.full.alkanesBytesPerTx),
        })}>
          <ToggleLineChart
            data={bytesPerTx}
            seriesKeys={[
              { key: "alkanes", label: copy.charts.bytesPerTx.series.alkanes },
              { key: "rest", label: copy.charts.bytesPerTx.series.rest },
            ]}
            colors={{ alkanes: ACCENT, rest: SECOND }}
            yTickFormatter={(v) => `${Math.round(v)}B`}
            tooltipFormatter={tooltipBytesPerTx}
            tip={copy.legendTip}
          />
        </Card>

        {/* 9. Miner fee revenue USD */}
        <Card title={copy.charts.minerRevenueUsd.title} desc={copy.charts.minerRevenueUsd.desc}>
          <SingleLineChart data={minerRevenueUsd} dataKey="value" color={SECOND} yTickFormatter={axisUsdCompact} tooltipFormatter={tooltipUsd} area />
        </Card>

        {/* 10. Miner fees split BTC (stacked) */}
        <Card title={copy.charts.feesSplitBtc.title} desc={copy.charts.feesSplitBtc.desc}>
          <ToggleLineChart
            data={feesSplitBtc}
            seriesKeys={[
              { key: "alkanes", label: copy.charts.feesSplitBtc.series.alkanes },
              { key: "rest", label: copy.charts.feesSplitBtc.series.rest },
            ]}
            colors={{ alkanes: ACCENT, rest: SECOND }}
            yTickFormatter={axisBtc}
            tooltipFormatter={tooltipBtc}
            area
            stacked
            tip={copy.legendTip}
          />
        </Card>

        {/* 11. Alkanes' share of miner fee revenue */}
        <Card title={copy.charts.alkanesFeeShare.title} desc={fill(copy.charts.alkanesFeeShare.desc, {
          feeShareFull: fmtPct(stats.full.alkanesFeeShare),
          feeShare30: fmtPct(stats.last30.alkanesFeeShare),
          opRetFeeShare30: fmtPct(stats.last30.opReturnFeeShare),
          opRetFeeShareFull: fmtPct(stats.full.opReturnFeeShare),
        })}>
          <SingleLineChart data={alkanesFeeShare} dataKey="value" color={ACCENT} yTickFormatter={axisPct} tooltipFormatter={tooltipPct} area />
        </Card>

        {/* Fee per transaction — Alkanes vs everyone else (sats/tx) */}
        <Card title={copy.charts.feePerTx.title} desc={copy.charts.feePerTx.desc}>
          <ToggleLineChart
            data={feePerTx}
            seriesKeys={[
              { key: "alkanes", label: copy.charts.feePerTx.series.alkanes },
              { key: "rest", label: copy.charts.feePerTx.series.rest },
            ]}
            colors={{ alkanes: ACCENT, rest: SECOND }}
            yTickFormatter={axisNumCompact}
            tooltipFormatter={tooltipSats}
            tip={copy.legendTip}
          />
        </Card>
      </div>

      <div className="mt-6 rounded-2xl border p-6" style={{ borderColor: HAIRLINE, background: "var(--ed-card, transparent)" }}>
        <div className="text-sm font-medium" style={{ color: "var(--ed-ink)" }}>{copy.howTitle}</div>
        <div className="mt-3 flex flex-col gap-3">
          {copy.how.map((p, i) => (
            <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--ed-muted)" }}>{p}</p>
          ))}
        </div>
      </div>

      {payload.updatedAt ? (
        <div className="mt-4 text-sm" style={{ color: "var(--ed-muted)" }}>{copy.updated}: {payload.updatedAt}.</div>
      ) : null}
    </section>
  )
}
