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
  updated: string
  subHeader: string
  windowAll: string
  window60: string
  legendTip: string
  howTitle: string
  how: string[]
  charts: {
    dailyShare: { title: string; series: { txShare: string; opReturnPenetration: string }; desc: string }
    opReturnShare: { title: string; series: { txPct: string; bytesPct: string }; desc: string }
    latestDonut: { title: string; series: { diesel: string; alkanesOther: string; other: string }; alkanesTotalLabel: string; desc: string }
    dieselTxShare: { title: string; desc: string }
    bytesCum: { title: string; series: { opReturn: string; alkanes: string; runes: string }; desc: string }
    bytesPerTx: { title: string; series: { alkanes: string; rest: string }; desc: string }
    minerRevenueUsd: { title: string; desc: string }
    feesSplitBtc: { title: string; series: { alkanes: string; rest: string }; desc: string }
    alkanesFeeShare: { title: string; desc: string }
  }
}

const ACCENT = "#5dcaa5"
const SECOND = "#f0997b"
const MUTED = "#aab8d6"
const DONUT_OTHER = "#22304a"
const DONUT_ALK_OTHER = "#8fd9c0"
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
const tooltipPct = (v: number) => `${(v * 100).toFixed(2)}%`
const tooltipBtc = (v: number) => `${v.toFixed(4)} BTC`
const tooltipUsd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`
const tooltipBytesPerTx = (v: number) => `${v.toFixed(1)} B`

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
  data, seriesKeys, colors, dashed, yTickFormatter, tooltipFormatter, area = false, stacked = false, tip,
}: {
  data: Record<string, unknown>[]
  seriesKeys: { key: string; label: string }[]
  colors: Record<string, string>
  dashed?: Record<string, boolean>
  yTickFormatter: (v: number) => string
  tooltipFormatter: (v: number) => string
  area?: boolean
  stacked?: boolean
  tip?: string
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const showLegend = seriesKeys.length > 1
  const ChartTag = area ? AreaChart : LineChart

  function onLegendClick(entry: LegendPayload) {
    const key = entry.dataKey
    if (typeof key !== "string") return
    setHidden((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ChartTag data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
            <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={yTickFormatter} domain={["auto", "auto"]} />
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
  data, dataKey, color, yTickFormatter, tooltipFormatter, area = false,
}: {
  data: OpReturnPoint[]
  dataKey: "value"
  color: string
  yTickFormatter: (v: number) => string
  tooltipFormatter: (v: number) => string
  area?: boolean
}) {
  const ChartTag = area ? AreaChart : LineChart
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ChartTag data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={yTickFormatter} domain={["auto", "auto"]} />
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

/** Slices the tail of an array to `n` items; `n === null` returns the whole array (All time). */
function windowSlice<T>(arr: T[], n: number | null): T[] {
  return n === null ? arr : arr.slice(-n)
}

export function OpReturnCharts({ payload, copy, locale }: { payload: PublicOpReturnPayload; copy: OpReturnCopy; locale: "en" | "zh" }) {
  const [windowDays, setWindowDays] = useState<number | null>(null) // null = All time

  const dailyShare = useMemo(() => windowSlice(payload.dailyShare, windowDays), [payload.dailyShare, windowDays])
  const opReturnShare = useMemo(() => windowSlice(payload.opReturnShare, windowDays), [payload.opReturnShare, windowDays])
  const dieselTxShare = useMemo(() => windowSlice(payload.dieselTxShare, windowDays), [payload.dieselTxShare, windowDays])
  const bytesCum = useMemo(() => windowSlice(payload.bytesCum, windowDays), [payload.bytesCum, windowDays])
  const bytesPerTx = useMemo(() => windowSlice(payload.bytesPerTx, windowDays), [payload.bytesPerTx, windowDays])
  const minerRevenueUsd = useMemo(() => windowSlice(payload.minerRevenueUsd, windowDays), [payload.minerRevenueUsd, windowDays])
  const feesSplitBtc = useMemo(() => windowSlice(payload.feesSplitBtc, windowDays), [payload.feesSplitBtc, windowDays])
  const alkanesFeeShare = useMemo(() => windowSlice(payload.alkanesFeeShare, windowDays), [payload.alkanesFeeShare, windowDays])

  if (payload.days === 0) return null
  const donut = payload.latestDonut
  const { header, stats } = payload

  const subHeader = fill(copy.subHeader, {
    firstDate: header.firstDate ? fmtDate(header.firstDate, locale) : "—",
    lastDate: header.lastDate ? fmtDate(header.lastDate, locale) : "—",
    days: payload.days.toLocaleString(locale === "zh" ? "zh-CN" : "en-US"),
    totalTx: header.totalTxSampled.toLocaleString(locale === "zh" ? "zh-CN" : "en-US"),
  })

  const donutTotal = donut ? donut.diesel + donut.alkanesOther + donut.other : 0
  const donutAlkanesPct = donut && donutTotal > 0 ? (donut.diesel + donut.alkanesOther) / donutTotal : null

  return (
    <section className="mt-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-medium" style={{ color: "var(--ed-ink)" }}>{copy.title}</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--ed-muted)" }}>{subHeader}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setWindowDays(null)}
            className="rounded-full border px-4 py-1.5 text-sm"
            style={{
              borderColor: HAIRLINE,
              color: windowDays === null ? "#04150f" : "var(--ed-ink)",
              background: windowDays === null ? ACCENT : "transparent",
              fontWeight: windowDays === null ? 600 : 400,
            }}
          >
            {copy.windowAll}
          </button>
          <button
            type="button"
            onClick={() => setWindowDays(60)}
            className="rounded-full border px-4 py-1.5 text-sm"
            style={{
              borderColor: HAIRLINE,
              color: windowDays === 60 ? "#04150f" : "var(--ed-ink)",
              background: windowDays === 60 ? ACCENT : "transparent",
              fontWeight: windowDays === 60 ? 600 : 400,
            }}
          >
            {copy.window60}
          </button>
        </div>
      </div>

      <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--ed-muted)" }}>
        {copy.note}{" "}
        <a href="https://github.com/Vdto88/alkanes-opreturn-stats" target="_blank" rel="noopener noreferrer" className="underline">
          {copy.noteLink}
        </a>
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
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

        {/* 3. Last day donut */}
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
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: copy.charts.latestDonut.series.diesel, value: donut.diesel },
                      { name: copy.charts.latestDonut.series.alkanesOther, value: donut.alkanesOther },
                      { name: copy.charts.latestDonut.series.other, value: donut.other },
                    ]}
                    dataKey="value"
                    innerRadius={55}
                    outerRadius={80}
                    isAnimationActive={false}
                  >
                    <Cell fill={ACCENT} />
                    <Cell fill={DONUT_ALK_OTHER} />
                    <Cell fill={DONUT_OTHER} />
                  </Pie>
                  <Tooltip formatter={(v: number) => v.toLocaleString("en-US")} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-sm" style={{ color: "var(--ed-muted)" }}>
              {copy.charts.latestDonut.alkanesTotalLabel} {fmtPct(donutAlkanesPct)}
            </div>
          </Card>
        ) : null}

        {/* 4. DIESEL mints share of all tx */}
        <Card title={copy.charts.dieselTxShare.title} desc={copy.charts.dieselTxShare.desc}>
          <SingleLineChart data={dieselTxShare} dataKey="value" color={SECOND} yTickFormatter={axisPct} tooltipFormatter={tooltipPct} area />
        </Card>

        {/* 5. OP_RETURN bytes cumulative */}
        <Card title={copy.charts.bytesCum.title} desc={copy.charts.bytesCum.desc}>
          <ToggleLineChart
            data={bytesCum}
            seriesKeys={[
              { key: "opReturn", label: copy.charts.bytesCum.series.opReturn },
              { key: "alkanes", label: copy.charts.bytesCum.series.alkanes },
              { key: "runes", label: copy.charts.bytesCum.series.runes },
            ]}
            colors={{ opReturn: MUTED, alkanes: ACCENT, runes: SECOND }}
            yTickFormatter={axisBytes}
            tooltipFormatter={(v) => axisBytes(v)}
            tip={copy.legendTip}
          />
        </Card>

        {/* 6. OP_RETURN bytes per tx */}
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

        {/* 7. Miner fee revenue USD */}
        <Card title={copy.charts.minerRevenueUsd.title} desc={copy.charts.minerRevenueUsd.desc}>
          <SingleLineChart data={minerRevenueUsd} dataKey="value" color={SECOND} yTickFormatter={axisUsdCompact} tooltipFormatter={tooltipUsd} area />
        </Card>

        {/* 8. Miner fees split BTC (stacked) */}
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

        {/* 9. Alkanes' share of miner fee revenue */}
        <Card title={copy.charts.alkanesFeeShare.title} desc={fill(copy.charts.alkanesFeeShare.desc, {
          feeShareFull: fmtPct(stats.full.alkanesFeeShare),
          feeShare30: fmtPct(stats.last30.alkanesFeeShare),
          opRetFeeShare: fmtPct(stats.full.opReturnFeeShare),
        })}>
          <SingleLineChart data={alkanesFeeShare} dataKey="value" color={ACCENT} yTickFormatter={axisPct} tooltipFormatter={tooltipPct} area />
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
