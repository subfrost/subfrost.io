"use client"

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { PricePoint } from "@/lib/ecosystem/candles"

export interface PriceChartCopy {
  title: string
}

// --ed-ice é o mesmo hex em dark e light; os demais tokens seguem o tema.
const STROKE = "var(--ed-ice, #5b9cff)"
const HAIR = "var(--ed-hair, #262626)"
const MUTED = "var(--ed-muted, #8a8a8a)"

/** ≥1 → $X.XX (milhares com separador); <1 → 4 dígitos significativos (preços de alkane são miúdos). */
export function formatUsd(v: number): string {
  if (!Number.isFinite(v)) return "—"
  if (v >= 1000) return `$${Math.round(v).toLocaleString("en-US")}`
  if (v >= 1) return `$${v.toFixed(2)}`
  return `$${v.toPrecision(4)}`
}

function fmtDay(t: number, locale: "en" | "zh", full = false): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    ...(full ? { year: "numeric" as const } : {}),
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(t * 1000))
}

export function PriceChart({ points, copy, locale }: {
  points: PricePoint[]
  copy: PriceChartCopy
  locale: "en" | "zh"
}) {
  if (points.length < 2) return null
  const data = points.map((p) => ({ ...p, day: fmtDay(p.t, locale) }))
  return (
    <section className="mt-8 rounded-[11px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-4 py-3.5">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--ed-muted)]">{copy.title}</p>
      <div className="mt-2 h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={HAIR} strokeDasharray="3 3" />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} minTickGap={40} />
            <YAxis
              tick={{ fontSize: 11, fill: MUTED }}
              tickLine={false}
              axisLine={false}
              width={72}
              tickFormatter={formatUsd}
              domain={["auto", "auto"]}
            />
            <Tooltip
              formatter={(v: number) => formatUsd(v)}
              labelFormatter={(_, payload) => {
                const t = payload?.[0]?.payload?.t
                return typeof t === "number" ? fmtDay(t, locale, true) : ""
              }}
              contentStyle={{
                background: "var(--ed-surface)",
                border: "1px solid var(--ed-hair)",
                borderRadius: 8,
                color: "var(--ed-ink)",
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--ed-muted)" }}
            />
            <Area
              type="monotone"
              dataKey="usd"
              name="USD"
              stroke={STROKE}
              fill={STROKE}
              fillOpacity={0.12}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
