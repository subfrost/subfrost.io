"use client"

import { LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import type { PublicOpReturnPayload, OpReturnPoint } from "@/lib/marketing/public-opreturn"

export interface OpReturnCopy {
  title: string
  note: string
  noteLink: string
  updated: string
  charts: {
    alkanesTxShare: string
    alkanesOpReturnShare: string
    latestDonut: string
    dieselTxShare: string
    opReturnBytesCum: string
    opReturnBytesPerTx: string
    feesTotalBtc: string
    feesStacked: string
    alkanesFeeShare: string
  }
}

const ACCENT = "#5dcaa5"
const SECOND = "#f0997b"
const HAIRLINE = "var(--ed-hairline, #22304a)"

const pct = (v: number) => `${(v * 100).toFixed(2)}%`
const btc = (v: number) => `${v.toFixed(4)} BTC`
const bytes = (v: number) => {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)} GB`
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)} MB`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} KB`
  return `${Math.round(v)} B`
}
const FORMATTERS = { pct, btc, bytes, num: (v: number) => v.toFixed(1) } as const
type Fmt = keyof typeof FORMATTERS

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-6" style={{ borderColor: HAIRLINE, background: "var(--ed-card, transparent)" }}>
      <div className="text-sm" style={{ color: "var(--ed-muted)" }}>{title}</div>
      {children}
    </div>
  )
}

function LineCard({ title, series, fmt, area = false }: { title: string; series: OpReturnPoint[]; fmt: Fmt; area?: boolean }) {
  const data = series.filter((p) => p.value !== null)
  const f = FORMATTERS[fmt]
  const ChartTag = area ? AreaChart : LineChart
  return (
    <Card title={title}>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ChartTag data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
            <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={(v: number) => f(v)} domain={["auto", "auto"]} />
            <Tooltip formatter={(v: number) => f(v)} labelStyle={{ color: "#334" }} />
            {area ? (
              <Area type="monotone" dataKey="value" stroke={ACCENT} fill={ACCENT} fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} />
            ) : (
              <Line type="monotone" dataKey="value" stroke={ACCENT} strokeWidth={2} dot={false} isAnimationActive={false} />
            )}
          </ChartTag>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

export function OpReturnCharts({ payload, copy }: { payload: PublicOpReturnPayload; copy: OpReturnCopy }) {
  if (payload.days === 0) return null
  const donut = payload.latestDonut
  return (
    <section className="mt-16">
      <h2 className="text-2xl font-medium" style={{ color: "var(--ed-ink)" }}>{copy.title}</h2>
      <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--ed-muted)" }}>
        {copy.note}{" "}
        <a href="https://github.com/Vdto88/alkanes-opreturn-stats" target="_blank" rel="noopener noreferrer" className="underline">
          {copy.noteLink}
        </a>
      </p>
      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <LineCard title={copy.charts.alkanesTxShare} series={payload.lines.alkanesTxShare} fmt="pct" />
        <LineCard title={copy.charts.alkanesOpReturnShare} series={payload.lines.alkanesOpReturnShare} fmt="pct" />
        {donut ? (
          <Card title={copy.charts.latestDonut}>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={[{ name: "Alkanes", value: donut.alkanes }, { name: "Other", value: donut.other }]} dataKey="value" innerRadius={55} outerRadius={80} isAnimationActive={false}>
                    <Cell fill={ACCENT} />
                    <Cell fill={HAIRLINE.startsWith("var") ? "#22304a" : HAIRLINE} />
                  </Pie>
                  <Tooltip formatter={(v: number) => v.toLocaleString("en-US")} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-sm" style={{ color: "var(--ed-muted)" }}>
              Alkanes {pct(donut.alkanes / (donut.alkanes + donut.other))}
            </div>
          </Card>
        ) : null}
        <LineCard title={copy.charts.dieselTxShare} series={payload.lines.dieselTxShare} fmt="pct" />
        <LineCard title={copy.charts.opReturnBytesCum} series={payload.lines.opReturnBytesCum} fmt="bytes" area />
        <LineCard title={copy.charts.opReturnBytesPerTx} series={payload.lines.opReturnBytesPerTx} fmt="num" />
        <LineCard title={copy.charts.feesTotalBtc} series={payload.lines.feesTotalBtc} fmt="btc" />
        <Card title={copy.charts.feesStacked}>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={payload.feesStacked} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
                <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={(v: number) => btc(v)} />
                <Tooltip formatter={(v: number) => btc(v)} labelStyle={{ color: "#334" }} />
                <Area type="monotone" dataKey="rest" stackId="1" stroke={SECOND} fill={SECOND} fillOpacity={0.25} isAnimationActive={false} />
                <Area type="monotone" dataKey="alkanes" stackId="1" stroke={ACCENT} fill={ACCENT} fillOpacity={0.4} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <LineCard title={copy.charts.alkanesFeeShare} series={payload.lines.alkanesFeeShare} fmt="pct" />
      </div>
      {payload.updatedAt ? (
        <div className="mt-4 text-sm" style={{ color: "var(--ed-muted)" }}>{copy.updated}: {payload.updatedAt}.</div>
      ) : null}
    </section>
  )
}
