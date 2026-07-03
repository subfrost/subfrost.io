import type { Metadata } from "next"
import { EditorialShell } from "@/components/articles/EditorialShell"
import { MetricCard } from "@/components/data/DataPageClient"
import { getPublicData, formatMetricValue, type PublicMetricKey } from "@/lib/marketing/public-data"
import { absoluteUrl } from "@/lib/seo"

export const dynamic = "force-dynamic"

type Locale = "en" | "zh"

const copy = {
  en: {
    title: "SUBFROST protocol data",
    subtitle: "Live metrics of the SUBFROST protocol on Bitcoin — updated daily, straight from the chain.",
    heroLabel: "BTC locked",
    heroSub: "frBTC supply",
    building: "History building since",
    updated: "Last updated",
    card: { share: "Copy card link", copied: "Copied!", post: "Post on X", sevenDays: "7d" },
  },
  zh: {
    title: "SUBFROST 协议数据",
    subtitle: "SUBFROST 比特币协议的实时指标——每日更新，直接来自链上。",
    heroLabel: "锁定的 BTC",
    heroSub: "frBTC 供应量",
    building: "历史数据积累开始于",
    updated: "最近更新",
    card: { share: "复制卡片链接", copied: "已复制!", post: "发布到 X", sevenDays: "7天" },
  },
} // one copy object per locale; keep both shapes identical (inference gives full typing)

const GRID: PublicMetricKey[] = ["diesel-holders", "diesel-price", "diesel-marketcap", "fire-price", "btc-diesel", "btc-fire"]

export async function generateMetadata({ searchParams }: { searchParams?: Promise<{ lang?: string }> }): Promise<Metadata> {
  const params = searchParams ? await searchParams : {}
  const locale: Locale = params.lang === "zh" ? "zh" : "en"
  const c = copy[locale]
  return {
    title: `${c.title} — subfrost.io/data`,
    description: c.subtitle,
    alternates: {
      canonical: absoluteUrl("/data"),
      languages: { en: absoluteUrl("/data"), zh: absoluteUrl("/data?lang=zh"), "x-default": absoluteUrl("/data") },
    },
    openGraph: {
      title: c.title,
      description: c.subtitle,
      images: [{ url: absoluteUrl("/data/card/btc-locked"), width: 1200, height: 675 }],
    },
    twitter: { card: "summary_large_image" },
  }
}

export default async function DataPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const params = searchParams ? await searchParams : {}
  const locale: Locale = params.lang === "zh" ? "zh" : "en"
  const c = copy[locale]
  const data = await getPublicData()
  const showCharts = data.seriesDays >= 7
  const firstDate = data.series.length ? data.series[0].date : null

  return (
    <EditorialShell>
      <main className="mx-auto w-full max-w-[1440px] px-6 pb-24 pt-16">
        <header className="flex flex-col gap-3">
          <h1 className="text-4xl font-medium" style={{ color: "var(--ed-ink)" }}>{c.title}</h1>
          <p className="max-w-2xl text-lg" style={{ color: "var(--ed-muted)" }}>{c.subtitle}</p>
        </header>

        <section className="mt-12 grid gap-6 md:grid-cols-2">
          <MetricCard metric="btc-locked" value={data.now["btc-locked"]} deltaPct={data.deltas7d["btc-locked"]} series={data.series} showChart={showCharts} copy={c.card} locale={locale} />
          <MetricCard metric="frbtc-supply" value={data.now["frbtc-supply"]} deltaPct={data.deltas7d["frbtc-supply"]} series={data.series} showChart={showCharts} copy={c.card} locale={locale} />
        </section>

        <section className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {GRID.map((m) => (
            <MetricCard key={m} metric={m} value={data.now[m]} deltaPct={data.deltas7d[m]} series={data.series} showChart={showCharts} copy={c.card} locale={locale} />
          ))}
        </section>

        <footer className="mt-12 text-sm" style={{ color: "var(--ed-muted)" }}>
          {!showCharts && firstDate ? <span>{c.building} {firstDate}. </span> : null}
          {data.updatedAt ? <span>{c.updated}: {data.updatedAt.slice(0, 10)}.</span> : null}
        </footer>
      </main>
    </EditorialShell>
  )
}
