"use client"

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { PeriodTotals } from "@/lib/financials/accounting/shapes"

const config: ChartConfig = {
  issuedUsd: { label: "Issued (USD)", color: "#38bdf8" }, // sky-400
  paidUsd: { label: "Paid (USD)", color: "#34d399" }, // emerald-400
  dieselPaid: { label: "DIESEL paid", color: "#fb923c" }, // orange-400
}

/** Spend-over-time for the 409A: grouped USD bars (issued vs paid) on the left
 *  axis + a DIESEL line on a secondary right axis (token is a different unit).
 *  Presentational — pass the period rows; chart reads oldest→newest. */
export function PeriodReportChart({ rows }: { rows: PeriodTotals[] }) {
  if (rows.length === 0) return null
  const data = [...rows].reverse() // rows are newest-first; chart reads chronological
  return (
    <ChartContainer config={config} className="h-[260px] w-full">
      <ComposedChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="period" tickLine={false} axisLine={false} />
        <YAxis
          yAxisId="usd"
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(v) => `$${Number(v).toLocaleString("en-US")}`}
        />
        <YAxis yAxisId="diesel" orientation="right" tickLine={false} axisLine={false} width={56} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar yAxisId="usd" dataKey="issuedUsd" fill="var(--color-issuedUsd)" radius={3} />
        <Bar yAxisId="usd" dataKey="paidUsd" fill="var(--color-paidUsd)" radius={3} />
        <Line yAxisId="diesel" type="monotone" dataKey="dieselPaid" stroke="var(--color-dieselPaid)" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ChartContainer>
  )
}
