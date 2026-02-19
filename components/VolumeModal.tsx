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

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function satsToBtc(sats: string): string {
  const btc = Number(sats) / 1e8
  return btc.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })
}

function fmtBtc(sats: number): string {
  return (sats / 1e8).toFixed(4)
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

const cardClass = cn(
  "relative rounded-2xl overflow-hidden",
  "bg-gradient-to-br from-slate-800/60 to-slate-900/60",
  "shadow-lg shadow-black/20",
  "before:absolute before:inset-x-0 before:top-0 before:h-4 before:rounded-t-2xl before:border-t before:border-l before:border-r before:border-white/10 before:pointer-events-none before:[mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]",
  "backdrop-blur-sm",
)

/* ------------------------------------------------------------------ */
/*  Tab Button Group                                                   */
/* ------------------------------------------------------------------ */

function ButtonGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-white/10">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors",
            value === opt.value
              ? "bg-[#5b9cff] text-white shadow-lg"
              : "bg-[#152238] text-[#e8f0ff]/60 hover:text-[#e8f0ff]"
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

function StatsCards({ period }: { period: string }) {
  const { data, isLoading } = useSWR("/api/volume/stats", fetcher, {
    refreshInterval: 300_000,
  })
  const { data: alkCirc } = useSWR("/api/alkanes-circulating", fetcher, {
    refreshInterval: 300_000,
  })
  const { data: brcCirc } = useSWR("/api/brc20-circulating", fetcher, {
    refreshInterval: 300_000,
  })

  // Total Volume = unwraps + circulating frBTC (matches Lifetime Tx Value)
  const totalVolumeSats =
    data && alkCirc && brcCirc
      ? String(
          Number(data.unwrap_volume_sats) +
          (alkCirc.circulatingSatoshis || 0) +
          Number(brcCirc.circulatingSatoshis || 0)
        )
      : undefined

  const periodLabel = period === "24h" ? "24H" : "7D"
  const wrapKey = period === "24h" ? "wrap_24h_sats" : "wrap_7d_sats"
  const unwrapKey = period === "24h" ? "unwrap_24h_sats" : "unwrap_7d_sats"

  const periodCards = [
    { label: `${periodLabel} Wraps`, value: data?.[wrapKey], color: "text-[#22c55e]" },
    { label: `${periodLabel} Unwraps`, value: data?.[unwrapKey], color: "text-[#ef4444]" },
  ]

  const totalCards = [
    { label: "Total Wraps", value: data?.wrap_volume_sats, color: "text-white" },
    { label: "Total Unwraps", value: data?.unwrap_volume_sats, color: "text-white" },
    { label: "Total Volume", value: totalVolumeSats, color: "text-white" },
  ]

  const allCards = [...periodCards, ...totalCards]
  const loading = isLoading || !alkCirc || !brcCirc

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
      {allCards.map((card, i) => (
        <div
          key={card.label}
          className={cn(
            cardClass,
            "p-4 sm:p-5",
            i === allCards.length - 1 && "col-span-2 sm:col-span-1"
          )}
        >
          <p className="text-xs sm:text-sm text-gray-400 mb-1">{card.label}</p>
          <p className={cn("text-lg sm:text-xl font-semibold tabular-nums", card.color)}>
            {loading ? (
              <span className="text-gray-500">--</span>
            ) : (
              <>
                {satsToBtc(card.value || "0")}{" "}
                <span className="text-xs text-gray-500">BTC</span>
              </>
            )}
          </p>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Volume Histogram Chart                                             */
/* ------------------------------------------------------------------ */

const CHART_BG = "#192335"
const GRID_COLOR = "rgba(255,255,255,0.04)"
const CHART_START = "2025-10-01" as Time
const CHART_HEIGHT = typeof window !== "undefined" && window.innerWidth < 640 ? 250 : 350

function VolumeChart({ period, interval }: { period: string; interval: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const wrapRef = useRef<ISeriesApi<"Histogram"> | null>(null)
  const unwrapRef = useRef<ISeriesApi<"Histogram"> | null>(null)
  const candleLookupRef = useRef<Map<string, CandleData>>(new Map())

  const { data: candles } = useSWR(
    `/api/volume/candles?interval=${interval}`,
    fetcher,
    { refreshInterval: 300_000 }
  )

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: "#71717a",
      },
      grid: {
        vertLines: { color: GRID_COLOR },
        horzLines: { color: GRID_COLOR },
      },
      width: containerRef.current.clientWidth,
      height: CHART_HEIGHT,
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
        `<div style="color:#94a3b8;margin-bottom:2px">${dateStr}</div>` +
        `<div><span style="color:#e2e8f0">Alkanes:</span> <span style="color:#22c55e">+${fmtBtc(aw)}</span> / <span style="color:#ef4444">-${fmtBtc(au)}</span> BTC</div>` +
        `<div><span style="color:#e2e8f0">BRC20:</span> <span style="color:#22c55e">+${fmtBtc(bw)}</span> / <span style="color:#ef4444">-${fmtBtc(bu)}</span> BTC</div>` +
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

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
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
    chartRef.current?.timeScale().fitContent()
  }, [candles])

  return (
    <div className={cn(cardClass, "p-4")} style={{ position: "relative" }}>
      <div className="flex items-center gap-4 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-[#22c55e]" />
          <span className="text-gray-400">Wrap volume</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-[#ef4444]" />
          <span className="text-gray-400">Unwrap volume</span>
        </div>
      </div>
      <div style={{ position: "relative" }}>
        <div ref={containerRef} />
        <div
          ref={tooltipRef}
          style={{
            display: "none",
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: 10,
            pointerEvents: "none",
            background: "rgba(15, 23, 42, 0.95)",
            border: "1px solid rgba(255,255,255,0.1)",
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

function CumulativeChart({ period, interval }: { period: string; interval: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const wrapRef = useRef<ISeriesApi<"Area"> | null>(null)
  const unwrapRef = useRef<ISeriesApi<"Area"> | null>(null)
  const candleLookupRef = useRef<Map<string, CandleData>>(new Map())

  const { data: candles } = useSWR(
    `/api/volume/candles?interval=${interval}&cumulative=true`,
    fetcher,
    { refreshInterval: 300_000 }
  )

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: "#71717a",
      },
      grid: {
        vertLines: { color: GRID_COLOR },
        horzLines: { color: GRID_COLOR },
      },
      width: containerRef.current.clientWidth,
      height: CHART_HEIGHT,
      timeScale: { timeVisible: false, borderColor: GRID_COLOR },
      rightPriceScale: { borderColor: GRID_COLOR },
      crosshair: { vertLine: { labelVisible: false } },
    })

    const wrapSeries = chart.addAreaSeries({
      lineColor: "#22c55e",
      topColor: "rgba(34, 197, 94, 0.4)",
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
      topColor: "rgba(239, 68, 68, 0.4)",
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
        `<div style="color:#94a3b8;margin-bottom:2px">${dateStr}</div>` +
        `<div><span style="color:#e2e8f0">Alkanes:</span> <span style="color:#22c55e">+${fmtBtc(aw)}</span> / <span style="color:#ef4444">-${fmtBtc(au)}</span> BTC</div>` +
        `<div><span style="color:#e2e8f0">BRC20:</span> <span style="color:#22c55e">+${fmtBtc(bw)}</span> / <span style="color:#ef4444">-${fmtBtc(bu)}</span> BTC</div>` +
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

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
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
    chartRef.current?.timeScale().fitContent()
  }, [candles])

  return (
    <div className={cn(cardClass, "p-4")} style={{ position: "relative" }}>
      <div className="flex items-center gap-4 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-[#22c55e]" />
          <span className="text-gray-400">Cumulative wrap</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-[#ef4444]" />
          <span className="text-gray-400">Cumulative unwrap</span>
        </div>
      </div>
      <div style={{ position: "relative" }}>
        <div ref={containerRef} />
        <div
          ref={tooltipRef}
          style={{
            display: "none",
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: 10,
            pointerEvents: "none",
            background: "rgba(15, 23, 42, 0.95)",
            border: "1px solid rgba(255,255,255,0.1)",
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

export default function VolumeModal({ isOpen, onClose }: VolumeModalProps) {
  const [period, setPeriod] = useState("24h")
  const [chartType, setChartType] = useState("volume")
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
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={modalRef}
          className="bg-[#121A2C] rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 relative pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
          >
            <X size={20} />
          </button>

          {/* Subtitle */}
          <p className="mt-1 text-xl text-gray-300 mb-6">
            BTC volume flowing through the SUBFROST protocol
          </p>

          {/* Tab selectors */}
          <div className="flex items-center gap-4 flex-wrap mb-6">
            <ButtonGroup
              options={[
                { value: "24h", label: "24H" },
                { value: "7d", label: "7D" },
              ]}
              value={period}
              onChange={setPeriod}
            />
            <ButtonGroup
              options={[
                { value: "volume", label: "Volume" },
                { value: "cumulative", label: "Cumulative" },
              ]}
              value={chartType}
              onChange={setChartType}
            />
          </div>

          {/* Stats cards */}
          <div className="mb-6">
            <StatsCards period={period} />
          </div>

          {/* Chart — key forces remount when interval changes */}
          {chartType === "volume" ? (
            <VolumeChart key={period} period={period} interval={period === "7d" ? "1w" : "1d"} />
          ) : (
            <CumulativeChart key={period} period={period} interval={period === "7d" ? "1w" : "1d"} />
          )}
        </div>
      </div>
    </>
  )
}
