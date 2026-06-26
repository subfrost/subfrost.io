"use client"

import type { CSSProperties } from "react"
import useSWR from "swr"
import { ArrowUpRight } from "lucide-react"

type Locale = "en" | "zh"

export type StatsPayload = {
  metrics?: {
    alkanesBtcLocked?: number | null
    brc20BtcLocked?: number | null
    alkanesCirculating?: number | null
    brc20Circulating?: number | null
    alkanesTotalUnwraps?: number | null
    brc20TotalUnwraps?: number | null
    btcPrice?: number | null
  }
  marquee?: {
    btcUsd?: number | null
  }
  stats?: {
    btcPrice?: number | null
  }
  btcUsd?: number | null
  totalBtcLocked?: number | null
  currentFrbtcSupply?: number | null
  lifetimeTxValueBtc?: number | null
  lifetimeTxValueUsd?: number | null
  updatedAt?: string | null
}

export type VolumeStatsPayload = {
  wrap_24h_sats?: string
  unwrap_24h_sats?: string
}

const copy = {
  en: {
    fallback: "—",
    items: [
      { key: "totalBtcLocked", label: "Total BTC locked", suffix: "BTC", href: "https://app.subfrost.io/markets" },
      { key: "currentFrbtcSupply", label: "Current frBTC supply", suffix: "frBTC", href: "https://app.subfrost.io/vaults" },
      { key: "lifetimeTxValueBtc", label: "Lifetime tx value", suffix: "BTC", href: "https://app.subfrost.io/markets" },
      { key: "volume24hBtc", label: "24H volume", suffix: "BTC", href: "/volume" },
    ],
  },
  zh: {
    fallback: "—",
    items: [
      { key: "totalBtcLocked", label: "锁定 BTC 总量", suffix: "BTC", href: "https://app.subfrost.io/markets" },
      { key: "currentFrbtcSupply", label: "当前 frBTC 供应", suffix: "frBTC", href: "https://app.subfrost.io/vaults" },
      { key: "lifetimeTxValueBtc", label: "累计交易价值", suffix: "BTC", href: "https://app.subfrost.io/markets" },
      { key: "volume24hBtc", label: "24H 交易量", suffix: "BTC", href: "/volume?lang=zh" },
    ],
  },
} satisfies Record<Locale, {
  fallback: string
  items: { key: keyof StatsPayload | "volume24hBtc"; label: string; suffix: string; href: string }[]
}>

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return response.json() as Promise<T>
}

const formatMetric = (value: number | null | undefined, suffix: string, fallback: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback

  if (suffix === "USD") {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: value >= 10 ? 3 : 4,
    maximumFractionDigits: value >= 10 ? 3 : 4,
  })} ${suffix}`
}

const normalizeBtcUsd = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null
  return value < 1_000 ? value * 1_000 : value
}

function sumKnown(values: Array<number | null | undefined>) {
  const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  return known.length === values.length ? known.reduce((sum, value) => sum + value, 0) : null
}

function metricValue(data: StatsPayload | undefined, key: keyof StatsPayload) {
  if (!data) return null
  if (typeof data[key] === "number") return data[key] as number

  const metrics = data.metrics
  if (!metrics) return null
  if (key === "totalBtcLocked") return sumKnown([metrics.alkanesBtcLocked, metrics.brc20BtcLocked])
  if (key === "currentFrbtcSupply") return sumKnown([metrics.alkanesCirculating, metrics.brc20Circulating])
  if (key === "lifetimeTxValueBtc") {
    return sumKnown([
      metrics.alkanesTotalUnwraps,
      metrics.brc20TotalUnwraps,
      metrics.alkanesCirculating,
      metrics.brc20Circulating,
    ])
  }
  if (key === "lifetimeTxValueUsd") {
    if (typeof data.lifetimeTxValueBtc === "number" && typeof metrics.btcPrice === "number") {
      return data.lifetimeTxValueBtc * metrics.btcPrice
    }
    const lifetimeBtc = sumKnown([
      metrics.alkanesTotalUnwraps,
      metrics.brc20TotalUnwraps,
      metrics.alkanesCirculating,
      metrics.brc20Circulating,
    ])
    return typeof lifetimeBtc === "number" && typeof metrics.btcPrice === "number" ? lifetimeBtc * metrics.btcPrice : null
  }
  return null
}

function btcPriceValue(data: StatsPayload | undefined) {
  return normalizeBtcUsd(data?.btcUsd ?? data?.marquee?.btcUsd ?? data?.stats?.btcPrice ?? data?.metrics?.btcPrice ?? null)
}

function usdValue(data: StatsPayload | undefined, nativeValue: number | null) {
  const btcPrice = btcPriceValue(data)
  return typeof nativeValue === "number" && typeof btcPrice === "number" ? nativeValue * btcPrice : null
}

function satsToBtc(value: string | undefined) {
  if (typeof value !== "string") return null
  const sats = Number(value)
  return Number.isFinite(sats) ? sats / 1e8 : null
}

export default function HomepageProtocolStats({
  locale = "en",
  initialStats,
  initialVolumeStats,
}: {
  locale?: Locale
  initialStats?: StatsPayload | null
  initialVolumeStats?: VolumeStatsPayload | null
}) {
  const t = copy[locale]
  const { data } = useSWR<StatsPayload>("/api/stats", fetchJson, {
    fallbackData: initialStats ?? undefined,
    refreshInterval: 180_000,
    revalidateIfStale: !initialStats,
    revalidateOnMount: !initialStats,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const { data: volumeData } = useSWR<VolumeStatsPayload>("/api/volume/stats?source=both", fetchJson, {
    fallbackData: initialVolumeStats ?? undefined,
    refreshInterval: 1_800_000,
    revalidateIfStale: !initialVolumeStats,
    revalidateOnMount: !initialVolumeStats,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const volume24hBtc = (() => {
    const wrap = satsToBtc(volumeData?.wrap_24h_sats)
    const unwrap = satsToBtc(volumeData?.unwrap_24h_sats)
    return typeof wrap === "number" && typeof unwrap === "number" ? wrap + unwrap : null
  })()

  return (
    <div className="homepage-protocol-stats grid grid-cols-2 gap-x-6 gap-y-7 sm:gap-6 lg:grid-cols-4">
      {t.items.map((item, index) => {
        const nativeValue = item.key === "volume24hBtc" ? volume24hBtc : metricValue(data, item.key as keyof StatsPayload)
        const convertedUsd = usdValue(data, nativeValue)
        const hasUsd = typeof convertedUsd === "number" && Number.isFinite(convertedUsd)

        return (
          <a
            key={item.key}
            href={item.href}
            className="homepage-protocol-stat group border-t pt-4 sm:pt-5"
            style={{ "--stat-index": index, borderColor: "var(--ed-hair)" } as CSSProperties}
          >
            <span className="homepage-protocol-stat-content block">
              <span className="flex items-center justify-between gap-4">
                <span className="font-display text-[14px] font-medium" style={{ color: "var(--ed-muted)" }}>
                  {item.label}
                </span>
                <ArrowUpRight className="h-4 w-4 opacity-45 transition-opacity duration-200 group-hover:opacity-100" strokeWidth={1.8} style={{ color: "var(--ed-muted)" }} />
              </span>
              <span
                className={`homepage-protocol-stat-value mt-3 font-mono text-[clamp(17px,4.6vw,22px)] font-semibold tabular-nums sm:text-[22px] ${hasUsd ? "homepage-protocol-stat-value-cycle" : ""}`}
                style={{ color: "var(--ed-ink)" }}
              >
                <span className="homepage-protocol-stat-native">
                  {formatMetric(nativeValue, item.suffix, t.fallback)}
                </span>
                {hasUsd ? (
                  <span className="homepage-protocol-stat-usd">
                    {formatMetric(convertedUsd, "USD", t.fallback)}
                  </span>
                ) : null}
              </span>
            </span>
          </a>
        )
      })}
    </div>
  )
}
