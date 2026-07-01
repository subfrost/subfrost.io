"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type HistogramData,
  type LineData,
  type Time,
  ColorType,
} from "lightweight-charts"
import { useTranslation } from "@/hooks/useTranslation"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function satsToBtc(sats: string, decimals: number = 4): string {
  const btc = Number(sats) / 1e8
  return btc.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtBtc(sats: number): string {
  return (sats / 1e8).toFixed(4)
}

function sentenceCase(value: string): string {
  const lower = value.toLocaleLowerCase()
  return lower.charAt(0).toLocaleUpperCase() + lower.slice(1)
}

interface CandleData {
  bucket: string
  wrap_sats: string
  unwrap_sats: string
  alkanes_wrap_sats: string
  alkanes_unwrap_sats: string
  brc20_wrap_sats: string
  brc20_unwrap_sats: string
}

const statCardClass = cn(
  "relative rounded-2xl",
  "bg-[rgba(255,255,255,0.7)] backdrop-blur-md",
  "shadow-[0_2px_10px_rgba(0,0,0,0.1)]",
)

/* ------------------------------------------------------------------ */
/*  Tab Button Group                                                   */
/* ------------------------------------------------------------------ */

type VolumePanelVariant = "modal" | "page"

function ButtonGroup({
  options,
  value,
  onChange,
  small,
  variant = "modal",
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  small?: boolean
  variant?: VolumePanelVariant
}) {
  const isPage = variant === "page"

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg",
        isPage ? "gap-4 p-0" : cn("gap-2 p-0.5", small ? null : "p-1")
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none focus:outline-none",
            isPage
              ? cn("font-display font-medium tracking-normal", small ? "px-2.5 py-1 text-[12px]" : "px-1 py-2 text-[14px]")
              : cn("font-bold uppercase tracking-wide", small ? "px-2.5 py-1 text-[10px] rounded" : "px-5 py-2 text-sm rounded-md"),
            isPage
              ? value === opt.value
                ? "bg-transparent text-[var(--ed-ink)]"
                : "bg-transparent text-[var(--ed-muted)] hover:text-[var(--ed-ink)]"
              : cn(
                "shadow-[0_2px_12px_rgba(0,0,0,0.08)]",
                value === opt.value
                  ? "bg-[#284372] text-white shadow-lg"
                  : "bg-white text-[#284372] hover:bg-[#f0f7ff]"
              )
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Stats Cards                                                        */
/* ------------------------------------------------------------------ */

function PeriodToggleLabel({
  period,
  onChange,
  suffix,
}: {
  period: string
  onChange: (v: string) => void
  suffix: string
}) {
  const btnClass = (active: boolean) =>
    cn(
      "transition-colors duration-150 focus:outline-none",
      active ? "text-[#284372] font-semibold" : "text-[#6b7280]/60 hover:text-[#284372]"
    )
  return (
    <p className="text-[10px] sm:text-xs text-[#6b7280]">
      <button
        type="button"
        onClick={() => onChange("24h")}
        className={btnClass(period === "24h")}
        aria-pressed={period === "24h"}
      >
        24H
      </button>
      <span className="mx-1 text-[#6b7280]/40">/</span>
      <button
        type="button"
        onClick={() => onChange("7d")}
        className={btnClass(period === "7d")}
        aria-pressed={period === "7d"}
      >
        7D
      </button>
      <span> {suffix}</span>
    </p>
  )
}

function StatsCards({
  period,
  source,
  onPeriodChange,
  variant = "modal",
}: {
  period: string
  source: string
  onPeriodChange: (v: string) => void
  variant?: VolumePanelVariant
}) {
  const { t } = useTranslation()
  const { data, isLoading } = useSWR(`/api/volume/stats?source=${source}`, fetcher, {
    refreshInterval: 1_800_000,
  })
  const wrapKey =
    period === "all" ? "wrap_volume_sats" : period === "24h" ? "wrap_24h_sats" : "wrap_7d_sats"
  const unwrapKey =
    period === "all" ? "unwrap_volume_sats" : period === "24h" ? "unwrap_24h_sats" : "unwrap_7d_sats"
  const valueDecimals = period === "all" ? 2 : 4

  const loading = isLoading

  const renderValue = (
    value: string | undefined,
    colorClass: string,
    decimals: number = 4,
    unitClassName = "text-xs"
  ) => (
    <p className={cn("text-lg sm:text-xl font-semibold tabular-nums", colorClass)}>
      {loading ? (
        <span className="text-[#6b7280]/50">--</span>
      ) : (
        <>
          {satsToBtc(value || "0", decimals)}{" "}
          <span className={cn(unitClassName, "text-[#6b7280]")}>BTC</span>
        </>
      )}
    </p>
  )

  if (variant === "page") {
    const periodStats = [
      {
        label: t("volume.wraps"),
        value: data?.[wrapKey],
        decimals: valueDecimals,
      },
      {
        label: t("volume.unwraps"),
        value: data?.[unwrapKey],
        decimals: valueDecimals,
      },
    ]

    const periodButtonClass = (active: boolean) =>
      cn(
        "font-display text-[14px] font-medium leading-tight transition-colors duration-150 focus:outline-none",
        active ? "text-[var(--ed-ink)]" : "text-[var(--ed-muted)] hover:text-[var(--ed-ink)]"
      )

    return (
      <div className="border-t pt-4" style={{ borderColor: "var(--ed-hair)" }}>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onPeriodChange("24h")}
            className={periodButtonClass(period === "24h")}
            aria-pressed={period === "24h"}
          >
            24H
          </button>
          <button
            type="button"
            onClick={() => onPeriodChange("7d")}
            className={periodButtonClass(period === "7d")}
            aria-pressed={period === "7d"}
          >
            7D
          </button>
          <button
            type="button"
            onClick={() => onPeriodChange("all")}
            className={periodButtonClass(period === "all")}
            aria-pressed={period === "all"}
          >
            All
          </button>
        </div>
        <div className="mt-7 grid max-w-[720px] grid-cols-2 gap-8 sm:gap-12">
          {periodStats.map((stat) => (
            <div key={`period-${stat.label}`}>
              <p className="font-display text-[15px] leading-tight sm:text-[16px]" style={{ color: "var(--ed-muted)" }}>
                {stat.label}
              </p>
              {renderValue(
                stat.value,
                "mt-4 font-mono text-[34px] leading-none text-[var(--ed-ink)] sm:text-[44px]",
                stat.decimals,
                "text-sm sm:text-base"
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
      {/* Wraps: 24H/7D + Total */}
      <div className={cn(statCardClass, "p-4 sm:p-5")}>
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <PeriodToggleLabel period={period} onChange={onPeriodChange} suffix={t("volume.wraps")} />
            {renderValue(data?.[wrapKey], "text-[#22c55e]", valueDecimals)}
          </div>
          <div>
            <p className="text-[10px] sm:text-xs text-[#6b7280]">{t("volume.totalWraps")}</p>
            {renderValue(data?.wrap_volume_sats, "text-[#284372]", 2)}
          </div>
        </div>
      </div>
      {/* Unwraps: 24H/7D + Total */}
      <div className={cn(statCardClass, "p-4 sm:p-5")}>
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <PeriodToggleLabel period={period} onChange={onPeriodChange} suffix={t("volume.unwraps")} />
            {renderValue(data?.[unwrapKey], "text-[#ef4444]", valueDecimals)}
          </div>
          <div>
            <p className="text-[10px] sm:text-xs text-[#6b7280]">{t("volume.totalUnwraps")}</p>
            {renderValue(data?.unwrap_volume_sats, "text-[#284372]", 2)}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Volume Histogram Chart                                             */
/* ------------------------------------------------------------------ */

const CHART_BG = "transparent"
const GRID_COLOR = "rgba(40, 67, 114, 0.06)"
const CHART_START = "2025-10-01" as Time
const CHART_HEIGHT_MOBILE = 250
const DEFAULT_VISIBLE_DAYS = 60

function setDefaultTimeRange(chart: IChartApi | null, rows: CandleData[], variant: VolumePanelVariant) {
  if (!chart) return
  if (variant !== "page" || rows.length === 0) {
    chart?.timeScale().fitContent()
    return
  }

  const end = new Date(rows[rows.length - 1].bucket)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - DEFAULT_VISIBLE_DAYS)
  chart.timeScale().setVisibleRange({
    from: start.toISOString().slice(0, 10) as Time,
    to: end.toISOString().slice(0, 10) as Time,
  })
}

/* ------------------------------------------------------------------ */
/*  Chart Skeleton Loader                                              */
/* ------------------------------------------------------------------ */

function ChartSkeleton({ variant }: { variant: "bars" | "area" }) {
  // Deterministic pseudo-random heights so the skeleton doesn't reshuffle on re-render
  const bars = Array.from({ length: 32 }, (_, i) => 25 + ((i * 53) % 65))

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage: `linear-gradient(${GRID_COLOR} 1px, transparent 1px), linear-gradient(90deg, ${GRID_COLOR} 1px, transparent 1px)`,
        backgroundSize: "40px 40px",
      }}
    >
      {variant === "bars" ? (
        <div className="absolute inset-x-4 bottom-6 top-2 flex items-end justify-between gap-[3px]">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-[#284372]/10 animate-pulse"
              style={{ height: `${h}%`, animationDelay: `${i * 40}ms` }}
            />
          ))}
        </div>
      ) : (
        <svg
          className="absolute inset-0 w-full h-full animate-pulse"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <defs>
            <linearGradient id="sk-grad-up" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(34, 197, 94, 0.25)" />
              <stop offset="100%" stopColor="rgba(34, 197, 94, 0)" />
            </linearGradient>
            <linearGradient id="sk-grad-down" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(239, 68, 68, 0.2)" />
              <stop offset="100%" stopColor="rgba(239, 68, 68, 0)" />
            </linearGradient>
          </defs>
          <path
            d="M 0 75 Q 15 70, 25 60 T 50 45 T 75 30 T 100 18 L 100 100 L 0 100 Z"
            fill="url(#sk-grad-up)"
          />
          <path
            d="M 0 75 Q 15 70, 25 60 T 50 45 T 75 30 T 100 18"
            fill="none"
            stroke="rgba(34, 197, 94, 0.4)"
            strokeWidth="0.6"
          />
          <path
            d="M 0 85 Q 20 82, 35 75 T 65 62 T 100 50 L 100 100 L 0 100 Z"
            fill="url(#sk-grad-down)"
          />
          <path
            d="M 0 85 Q 20 82, 35 75 T 65 62 T 100 50"
            fill="none"
            stroke="rgba(239, 68, 68, 0.35)"
            strokeWidth="0.6"
          />
        </svg>
      )}
    </div>
  )
}

function VolumeChart({
  period,
  interval,
  source,
  variant = "modal",
}: {
  period: string
  interval: string
  source: string
  variant?: VolumePanelVariant
}) {
  const { t } = useTranslation()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const wrapRef = useRef<ISeriesApi<"Histogram"> | null>(null)
  const unwrapRef = useRef<ISeriesApi<"Histogram"> | null>(null)
  const candleLookupRef = useRef<Map<string, CandleData>>(new Map())

  const { data: candles } = useSWR(
    `/api/volume/candles?interval=${interval}&source=${source}`,
    fetcher,
    { refreshInterval: 1_800_000 }
  )
  const isLoading = !Array.isArray(candles)

  useEffect(() => {
    if (!containerRef.current || !wrapperRef.current) return

    const isMobile = window.innerWidth < 640
    const initialHeight = isMobile ? CHART_HEIGHT_MOBILE : wrapperRef.current.clientHeight

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: "#6b7280",
      },
      grid: {
        vertLines: { color: GRID_COLOR },
        horzLines: { color: GRID_COLOR },
      },
      width: containerRef.current.clientWidth,
      height: initialHeight,
      timeScale: { timeVisible: false, borderColor: GRID_COLOR },
      rightPriceScale: { borderColor: GRID_COLOR },
      crosshair: { vertLine: { labelVisible: false } },
    })

    const wrapSeries = chart.addHistogramSeries({
      color: "#22c55e",
      priceFormat: {
        type: "custom",
        formatter: (price: number) => (price / 1e8).toFixed(4) + " BTC",
      },
      priceScaleId: "right",
      lastValueVisible: false,
      priceLineVisible: false,
    })

    const unwrapSeries = chart.addHistogramSeries({
      color: "#ef4444",
      priceFormat: {
        type: "custom",
        formatter: (price: number) => (Math.abs(price) / 1e8).toFixed(4) + " BTC",
      },
      priceScaleId: "right",
      lastValueVisible: false,
      priceLineVisible: false,
    })

    chart.subscribeCrosshairMove((param) => {
      const tooltip = tooltipRef.current
      const container = containerRef.current
      if (!tooltip || !container) return

      if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
        tooltip.style.display = "none"
        return
      }

      const dateStr = String(param.time)
      const row = candleLookupRef.current.get(dateStr)
      if (!row) {
        tooltip.style.display = "none"
        return
      }

      const aw = Number(row.alkanes_wrap_sats)
      const au = Number(row.alkanes_unwrap_sats)
      const bw = Number(row.brc20_wrap_sats)
      const bu = Number(row.brc20_unwrap_sats)

      tooltip.innerHTML =
        `<div style="font-size:12px;line-height:1.6;white-space:nowrap">` +
        `<div style="color:#6b7280;margin-bottom:2px">${dateStr}</div>` +
        `<div><span style="color:#284372">Alkanes:</span> <span style="color:#16a34a">+${fmtBtc(aw)}</span> / <span style="color:#dc2626">-${fmtBtc(au)}</span> BTC</div>` +
        `<div><span style="color:#284372">BRC20:</span> <span style="color:#16a34a">+${fmtBtc(bw)}</span> / <span style="color:#dc2626">-${fmtBtc(bu)}</span> BTC</div>` +
        `</div>`

      tooltip.style.display = "block"

      const tooltipWidth = tooltip.offsetWidth
      const containerWidth = container.clientWidth
      let left = param.point.x + 16
      if (left + tooltipWidth > containerWidth) {
        left = param.point.x - tooltipWidth - 16
      }
      tooltip.style.left = left + "px"
      tooltip.style.top = param.point.y - 10 + "px"
    })

    chartRef.current = chart
    wrapRef.current = wrapSeries
    unwrapRef.current = unwrapSeries

    const ro = new ResizeObserver(() => {
      if (wrapperRef.current && containerRef.current) {
        const isMobile = window.innerWidth < 640
        const h = isMobile ? CHART_HEIGHT_MOBILE : wrapperRef.current.clientHeight
        chart.applyOptions({ width: containerRef.current.clientWidth, height: h })
      }
    })
    ro.observe(wrapperRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!Array.isArray(candles) || !wrapRef.current || !unwrapRef.current) return

    const filtered = candles.filter(
      (c: CandleData) => c.bucket.slice(0, 10) > "2025-10-01"
    )

    // Build lookup for tooltip
    const lookup = new Map<string, CandleData>()
    for (const c of filtered) {
      lookup.set(c.bucket.slice(0, 10), c)
    }
    candleLookupRef.current = lookup

    // Anchor point at chart start so the time scale extends back to Oct 1
    const anchor: HistogramData<Time> = { time: CHART_START, value: 0 }

    const wrapData: HistogramData<Time>[] = [
      anchor,
      ...filtered.map((c: CandleData) => ({
        time: c.bucket.slice(0, 10) as Time,
        value: Number(c.wrap_sats),
        color: "#22c55e",
      })),
    ]

    const unwrapData: HistogramData<Time>[] = [
      anchor,
      ...filtered.map((c: CandleData) => ({
        time: c.bucket.slice(0, 10) as Time,
        value: -Number(c.unwrap_sats),
        color: "#ef4444",
      })),
    ]

    wrapRef.current.setData(wrapData)
    unwrapRef.current.setData(unwrapData)
    setDefaultTimeRange(chartRef.current, filtered, variant)
  }, [candles, variant])

  return (
    <div
      className={cn(
        "sm:flex sm:flex-col",
        variant === "page" ? "min-h-[300px] sm:min-h-[560px]" : "sm:flex-1 sm:min-h-0"
      )}
      style={{ position: "relative" }}
    >
      <div className="flex items-center gap-4 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-[#22c55e]" />
          <span className="text-[#6b7280]">{t("volume.wraps")}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-[#ef4444]" />
          <span className="text-[#6b7280]">{t("volume.unwraps")}</span>
        </div>
      </div>
      <div ref={wrapperRef} className={cn("min-h-[250px]", variant === "page" ? "sm:flex-1" : "sm:flex-1 sm:min-h-0")} style={{ position: "relative" }}>
        <div ref={containerRef} />
        {isLoading && <ChartSkeleton variant="bars" />}
        <div
          ref={tooltipRef}
          style={{
            display: "none",
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: 10,
            pointerEvents: "none",
            background: "rgba(255, 255, 255, 0.96)",
            border: "1px solid #d5def0",
            boxShadow: "0 4px 12px rgba(40, 67, 114, 0.1)",
            borderRadius: "8px",
            padding: "8px 12px",
          }}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Cumulative Area Chart                                              */
/* ------------------------------------------------------------------ */

function CumulativeChart({
  period,
  interval,
  source,
  variant = "modal",
}: {
  period: string
  interval: string
  source: string
  variant?: VolumePanelVariant
}) {
  const { t } = useTranslation()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const wrapRef = useRef<ISeriesApi<"Area"> | null>(null)
  const unwrapRef = useRef<ISeriesApi<"Area"> | null>(null)
  const candleLookupRef = useRef<Map<string, CandleData>>(new Map())

  const { data: candles } = useSWR(
    `/api/volume/candles?interval=${interval}&cumulative=true&source=${source}`,
    fetcher,
    { refreshInterval: 1_800_000 }
  )
  const isLoading = !Array.isArray(candles)

  useEffect(() => {
    if (!containerRef.current || !wrapperRef.current) return

    const isMobile = window.innerWidth < 640
    const initialHeight = isMobile ? CHART_HEIGHT_MOBILE : wrapperRef.current.clientHeight

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: "#6b7280",
      },
      grid: {
        vertLines: { color: GRID_COLOR },
        horzLines: { color: GRID_COLOR },
      },
      width: containerRef.current.clientWidth,
      height: initialHeight,
      timeScale: { timeVisible: false, borderColor: GRID_COLOR },
      rightPriceScale: { borderColor: GRID_COLOR },
      crosshair: { vertLine: { labelVisible: false } },
    })

    const wrapSeries = chart.addAreaSeries({
      lineColor: "#22c55e",
      topColor: "rgba(34, 197, 94, 0.25)",
      bottomColor: "rgba(34, 197, 94, 0.0)",
      lineWidth: 2,
      priceFormat: {
        type: "custom",
        formatter: (price: number) => (price / 1e8).toFixed(2) + " BTC",
      },
      lastValueVisible: false,
      priceLineVisible: false,
    })

    const unwrapSeries = chart.addAreaSeries({
      lineColor: "#ef4444",
      topColor: "rgba(239, 68, 68, 0.25)",
      bottomColor: "rgba(239, 68, 68, 0.0)",
      lineWidth: 2,
      priceFormat: {
        type: "custom",
        formatter: (price: number) => (price / 1e8).toFixed(2) + " BTC",
      },
      lastValueVisible: false,
      priceLineVisible: false,
    })

    chart.subscribeCrosshairMove((param) => {
      const tooltip = tooltipRef.current
      const container = containerRef.current
      if (!tooltip || !container) return

      if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
        tooltip.style.display = "none"
        return
      }

      const dateStr = String(param.time)
      const row = candleLookupRef.current.get(dateStr)
      if (!row) {
        tooltip.style.display = "none"
        return
      }

      const aw = Number(row.alkanes_wrap_sats)
      const au = Number(row.alkanes_unwrap_sats)
      const bw = Number(row.brc20_wrap_sats)
      const bu = Number(row.brc20_unwrap_sats)

      tooltip.innerHTML =
        `<div style="font-size:12px;line-height:1.6;white-space:nowrap">` +
        `<div style="color:#6b7280;margin-bottom:2px">${dateStr}</div>` +
        `<div><span style="color:#284372">Alkanes:</span> <span style="color:#16a34a">+${fmtBtc(aw)}</span> / <span style="color:#dc2626">-${fmtBtc(au)}</span> BTC</div>` +
        `<div><span style="color:#284372">BRC20:</span> <span style="color:#16a34a">+${fmtBtc(bw)}</span> / <span style="color:#dc2626">-${fmtBtc(bu)}</span> BTC</div>` +
        `</div>`

      tooltip.style.display = "block"

      const tooltipWidth = tooltip.offsetWidth
      const containerWidth = container.clientWidth
      let left = param.point.x + 16
      if (left + tooltipWidth > containerWidth) {
        left = param.point.x - tooltipWidth - 16
      }
      tooltip.style.top = param.point.y - 10 + "px"
      tooltip.style.left = left + "px"
    })

    chartRef.current = chart
    wrapRef.current = wrapSeries
    unwrapRef.current = unwrapSeries

    const ro = new ResizeObserver(() => {
      if (wrapperRef.current && containerRef.current) {
        const isMobile = window.innerWidth < 640
        const h = isMobile ? CHART_HEIGHT_MOBILE : wrapperRef.current.clientHeight
        chart.applyOptions({ width: containerRef.current.clientWidth, height: h })
      }
    })
    ro.observe(wrapperRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!Array.isArray(candles) || !wrapRef.current || !unwrapRef.current) return

    const filtered = candles.filter(
      (c: CandleData) => c.bucket.slice(0, 10) > "2025-10-01"
    )

    // Build lookup for tooltip
    const lookup = new Map<string, CandleData>()
    for (const c of filtered) {
      lookup.set(c.bucket.slice(0, 10), c)
    }
    candleLookupRef.current = lookup

    // Anchor point at chart start so the time scale extends back to Oct 1
    const anchor: LineData<Time> = { time: CHART_START, value: 0 }

    const wrapData: LineData<Time>[] = [
      anchor,
      ...filtered.map((c: CandleData) => ({
        time: c.bucket.slice(0, 10) as Time,
        value: Number(c.wrap_sats),
      })),
    ]

    const unwrapData: LineData<Time>[] = [
      anchor,
      ...filtered.map((c: CandleData) => ({
        time: c.bucket.slice(0, 10) as Time,
        value: Number(c.unwrap_sats),
      })),
    ]

    wrapRef.current.setData(wrapData)
    unwrapRef.current.setData(unwrapData)
    setDefaultTimeRange(chartRef.current, filtered, variant)
  }, [candles, variant])

  return (
    <div
      className={cn(
        "sm:flex sm:flex-col",
        variant === "page" ? "min-h-[300px] sm:min-h-[560px]" : "sm:flex-1 sm:min-h-0"
      )}
      style={{ position: "relative" }}
    >
      <div className="flex items-center gap-4 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-[#22c55e]" />
          <span className="text-[#6b7280]">{t("volume.wraps")}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-[#ef4444]" />
          <span className="text-[#6b7280]">{t("volume.unwraps")}</span>
        </div>
      </div>
      <div ref={wrapperRef} className={cn("min-h-[250px]", variant === "page" ? "sm:flex-1" : "sm:flex-1 sm:min-h-0")} style={{ position: "relative" }}>
        <div ref={containerRef} />
        {isLoading && <ChartSkeleton variant="area" />}
        <div
          ref={tooltipRef}
          style={{
            display: "none",
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: 10,
            pointerEvents: "none",
            background: "rgba(255, 255, 255, 0.96)",
            border: "1px solid #d5def0",
            boxShadow: "0 4px 12px rgba(40, 67, 114, 0.1)",
            borderRadius: "8px",
            padding: "8px 12px",
          }}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Modal                                                         */
/* ------------------------------------------------------------------ */

interface VolumeModalProps {
  isOpen: boolean
  onClose: () => void
}

export function VolumeChartPanel({
  variant = "modal",
  onClose,
}: {
  variant?: "modal" | "page"
  onClose?: () => void
}) {
  const { t } = useTranslation()
  const [period, setPeriod] = useState("24h")
  const [chartType, setChartType] = useState("volume")
  const [source, setSource] = useState("both")
  const isPage = variant === "page"

  return (
    <div
      className={cn(
        "relative flex w-full flex-col",
        isPage
          ? "overflow-visible bg-transparent"
          : "max-h-[90vh] max-w-5xl overflow-hidden rounded-2xl bg-[#f0f7ff] shadow-xl shadow-[#284372]/10 sm:h-[90vh]",
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex-shrink-0",
        isPage ? "sr-only" : "bg-white/50 px-6 py-5 shadow-[0_2px_8px_rgba(40,67,114,0.15)]"
      )}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-extrabold uppercase tracking-wider text-[#284372]">
            {t("volume.title")}
          </h2>
          {onClose ? (
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-[#284372]/70 shadow-[0_2px_8px_rgba(40,67,114,0.15)] outline-none transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:bg-[#f0f7ff] hover:text-[#284372] hover:shadow-[0_4px_12px_rgba(40,67,114,0.2)] hover:transition-none"
              aria-label={t("volume.close")}
            >
              <X size={18} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div className={cn(
        "flex-1",
        isPage ? "overflow-visible" : "overflow-y-auto p-4 sm:flex sm:flex-col sm:overflow-hidden sm:p-6"
      )}>

        {/* Tab selectors */}
        <div className={cn(
          "flex flex-wrap items-center justify-between gap-4 sm:shrink-0",
          isPage ? "mb-8" : "mb-6"
        )}>
          <ButtonGroup
            options={[
              { value: "both", label: sentenceCase(t("volume.both")) },
              { value: "alkanes", label: sentenceCase(t("volume.alkanes")) },
              { value: "brc20", label: "BRC20" },
            ]}
            value={source}
            onChange={setSource}
            variant={variant}
          />
        </div>

        {/* Stats cards */}
        <div className={cn("sm:shrink-0", isPage ? "mb-10" : "mb-6")}>
          <StatsCards period={period} source={source} onPeriodChange={setPeriod} variant={variant} />
        </div>

        {/* Chart — key forces remount when interval changes */}
        <div className={cn(
          "relative sm:flex sm:flex-col",
          isPage ? "pt-2" : "sm:min-h-0 sm:flex-1"
        )}>
          <div className="mb-3 flex justify-end sm:absolute sm:right-0 sm:top-0 sm:z-10 sm:mb-0">
            <ButtonGroup
              small
              options={[
                { value: "volume", label: sentenceCase(t("volume.volume")) },
                { value: "cumulative", label: sentenceCase(t("volume.cumulative")) },
              ]}
              value={chartType}
              onChange={setChartType}
              variant={variant}
            />
          </div>
          {chartType === "volume" ? (
            <VolumeChart key={`${period}-${source}`} period={period} interval={period === "7d" ? "1w" : "1d"} source={source} variant={variant} />
          ) : (
            <CumulativeChart key={`${period}-${source}`} period={period} interval={period === "7d" ? "1w" : "1d"} source={source} variant={variant} />
          )}
        </div>
      </div>
    </div>
  )
}

export default function VolumeModal({ isOpen, onClose }: VolumeModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }

    document.addEventListener("keydown", handleEscape)
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", handleEscape)
      document.body.style.overflow = ""
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-[#284372]/20 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={modalRef}
          className="w-full max-w-5xl pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <VolumeChartPanel onClose={onClose} />
        </div>
      </div>
    </>
  )
}
