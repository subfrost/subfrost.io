"use client"

import type { CSSProperties } from "react"
import useSWR from "swr"
import { Activity, ArrowUpRight, Bitcoin, Flame, Fuel, RadioTower } from "lucide-react"

export type HomepagePayload = {
  btcUsd?: number | null
  btcHeight?: number | null
  msHeight?: number | null
  dieselUsd?: number | null
  fireUsd?: number | null
  marquee?: {
    btcUsd?: number | null
    btcHeight?: number | null
    metashrewHeight?: number | null
    dieselUsd?: number | null
    fireUsd?: number | null
  }
  metrics?: {
    btcPrice?: number | null
  }
  stats?: {
    btcHeight?: number | null
    metashrewHeight?: number | null
    btcPrice?: number | null
    btcDieselPrice?: number | null
    btcFirePrice?: number | null
  }
  btcDieselPrice?: number | null
  btcFirePrice?: number | null
}

type Locale = "en" | "zh"

const tickerCopy = {
  en: {
    fallback: "—",
    btcHeight: "BTC height",
    msHeight: "MS height",
  },
  zh: {
    fallback: "—",
    btcHeight: "BTC 高度",
    msHeight: "MS 高度",
  },
} satisfies Record<Locale, { fallback: string; btcHeight: string; msHeight: string }>

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

async function fetchStats(locale: Locale) {
  try {
    return await fetchJson<HomepagePayload>("/api/stats")
  } catch {
    return fetchJson<HomepagePayload>(locale === "zh" ? "/api/homepage?lang=zh" : "/api/homepage")
  }
}

const formatInteger = (value: number | null | undefined, fallback: string) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US")
    : fallback

const formatUsd = (value: number | null | undefined, fallback: string) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : fallback

const normalizeBtcUsd = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null
  return value < 1_000 ? value * 1_000 : value
}

const formatRatio = (value: number | null | undefined, fallback: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback

  return value.toLocaleString("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  })
}

const deriveRatio = (btcUsd: number | null | undefined, assetUsd: number | null | undefined) =>
  typeof btcUsd === "number" && typeof assetUsd === "number" && assetUsd > 0 ? btcUsd / assetUsd : null

export default function HeroMarketTicker({
  locale = "en",
  initialData,
}: {
  locale?: Locale
  initialData?: HomepagePayload | null
}) {
  const copy = tickerCopy[locale]
  const { data } = useSWR<HomepagePayload>(["homepage-stats", locale], () => fetchStats(locale), {
    fallbackData: initialData ?? undefined,
    refreshInterval: 180_000,
    revalidateIfStale: !initialData,
    revalidateOnMount: !initialData,
    revalidateOnFocus: false,
  })
  const btcUsd = normalizeBtcUsd(data?.btcUsd ?? data?.marquee?.btcUsd ?? data?.metrics?.btcPrice ?? data?.stats?.btcPrice)
  const dieselUsd = data?.dieselUsd ?? data?.marquee?.dieselUsd
  const fireUsd = data?.fireUsd ?? data?.marquee?.fireUsd
  const btcDieselRatio = data?.stats?.btcDieselPrice ?? data?.btcDieselPrice ?? deriveRatio(btcUsd, dieselUsd)
  const btcFireRatio = data?.stats?.btcFirePrice ?? data?.btcFirePrice ?? deriveRatio(btcUsd, fireUsd)
  const stats = {
    btcHeight: data?.btcHeight ?? data?.marquee?.btcHeight ?? data?.stats?.btcHeight,
    metashrewHeight: data?.msHeight ?? data?.marquee?.metashrewHeight ?? data?.stats?.metashrewHeight,
    btcPrice: btcUsd,
    btcDieselPrice: btcDieselRatio,
    btcFirePrice: btcFireRatio,
  }

  const items = [
    { label: copy.btcHeight, value: formatInteger(stats?.btcHeight, copy.fallback), icon: Bitcoin, href: "https://app.subfrost.io/activity" },
    { label: copy.msHeight, value: formatInteger(stats?.metashrewHeight, copy.fallback), icon: RadioTower, href: "https://app.subfrost.io/activity" },
    { label: "BTC/USD", value: formatUsd(stats?.btcPrice, copy.fallback), icon: Activity, href: "https://app.subfrost.io/markets" },
    { label: "BTC/DIESEL", value: formatRatio(stats?.btcDieselPrice, copy.fallback), icon: Fuel, href: "https://app.subfrost.io/swap?from=btc&to=2%3A0" },
    { label: "BTC/FIRE", value: formatRatio(stats?.btcFirePrice, copy.fallback), icon: Flame, href: "https://app.subfrost.io/swap?from=btc&to=2%3A77623" },
  ]

  return (
    <div className="hero-market-ticker w-full max-w-[62rem] bg-transparent">
      <div className="hero-market-ticker-track grid grid-cols-2 items-center gap-x-4 gap-y-3 md:flex md:justify-between md:gap-6">
        {items.map((item, index) => {
          const Icon = item.icon
          return (
            <a
              key={item.label}
              href={item.href}
              className="hero-market-ticker-item group flex min-w-0 justify-start rounded-[6px] py-1.5 transition-colors duration-200 last:col-span-2 last:justify-center md:flex-none md:py-2 md:last:col-span-1"
              style={{ "--ticker-index": index, color: "var(--ed-ink)" } as CSSProperties}
            >
              <span className="hero-market-ticker-content flex min-w-0 items-center justify-start gap-2 md:justify-center">
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-85" aria-hidden="true" />
                <span className="shrink-0 whitespace-nowrap text-[0.64rem] font-medium leading-none tracking-normal opacity-75 sm:text-[0.7rem]">
                  {item.label}
                </span>
                <span className="shrink-0 whitespace-nowrap font-mono text-[0.72rem] font-semibold leading-none tabular-nums sm:text-[0.8rem]">
                  {item.value}
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-55 transition-opacity duration-200 group-hover:opacity-100" strokeWidth={2} aria-hidden="true" />
              </span>
            </a>
          )
        })}
      </div>
    </div>
  )
}
