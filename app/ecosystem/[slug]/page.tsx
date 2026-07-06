import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { EditorialShell } from "@/components/articles/EditorialShell"
import { EcosystemProfile, type ProfileCopy } from "@/components/ecosystem/EcosystemProfile"
import { StatHero, type StatHeroCopy } from "@/components/ecosystem/StatHero"
import { PriceChart } from "@/components/ecosystem/PriceChart"
import { getEcosystemProfile, getEcosystemStatsWithDelta } from "@/lib/ecosystem/public"
import { getEcosystemPriceSeries } from "@/lib/ecosystem/candles"
import { absoluteUrl } from "@/lib/seo"

export const dynamic = "force-dynamic"

type Locale = "en" | "zh"

const copy: Record<Locale, ProfileCopy> = {
  en: {
    back: "← Ecosystem",
    disclaimer: "Listed for discovery only — SUBFROST does not endorse or vouch for this project. Always do your own research.",
    website: "Website", docs: "Docs", overview: "Overview",
    contractsTitle: "Contracts", contractCol: "Contract", idCol: "Alkane ID", notesCol: "Notes",
    statuses: { Live: "Live", Beta: "Beta", Building: "Building" },
    stats: { holders: "Holders", supply: "Supply", price: "Price (USD)" },
    chart: { title: "Price (90d)" },
  },
  zh: {
    back: "← 生态系统",
    disclaimer: "仅供发现之用——SUBFROST 不对该项目作背书或担保。请务必自行研究（DYOR）。",
    website: "官网", docs: "文档", overview: "概览",
    contractsTitle: "合约", contractCol: "合约", idCol: "Alkane ID", notesCol: "说明",
    statuses: { Live: "已上线", Beta: "测试版", Building: "构建中" },
    stats: { holders: "持有者", supply: "供应量", price: "价格 (USD)" },
    chart: { title: "价格（90 天）" },
  },
}

type Props = { params: Promise<{ slug: string }>; searchParams?: Promise<{ lang?: string }> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const sp = searchParams ? await searchParams : {}
  const locale: Locale = sp.lang === "zh" ? "zh" : "en"
  const p = await getEcosystemProfile(slug, locale)
  if (!p) return { title: "Ecosystem" }
  return {
    title: `${p.name} — Alkanes ecosystem`,
    description: p.description,
    alternates: {
      canonical: absoluteUrl(`/ecosystem/${p.slug}`),
      languages: {
        en: absoluteUrl(`/ecosystem/${p.slug}`),
        zh: absoluteUrl(`/ecosystem/${p.slug}?lang=zh`),
        "x-default": absoluteUrl(`/ecosystem/${p.slug}`),
      },
    },
  }
}

export default async function EcosystemProjectPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = searchParams ? await searchParams : {}
  const locale: Locale = sp.lang === "zh" ? "zh" : "en"
  const [p, s, series] = await Promise.all([
    getEcosystemProfile(slug, locale),
    getEcosystemStatsWithDelta(slug).catch(() => null), // hero é decorativo: falha de stats não derruba o profile
    getEcosystemPriceSeries(slug).catch(() => null), // idem: gráfico é decorativo
  ])
  if (!p) notFound()
  const backHref = locale === "zh" ? "/ecosystem?lang=zh" : "/ecosystem"
  return (
    <EditorialShell>
      <main className="mx-auto w-full max-w-[880px] px-6 pb-24 pt-10 sm:px-10">
        <EcosystemProfile
          p={p} copy={copy[locale]} backHref={backHref}
          statHero={<StatHero stats={s?.current ?? null} baseline={s?.baseline ?? null} periodLabel={s?.periodLabel ?? null} mainAlkaneId={p.alkaneId} copy={copy[locale].stats} locale={locale} />}
          priceChart={series ? <PriceChart points={series} copy={copy[locale].chart} locale={locale} /> : null}
        />
      </main>
    </EditorialShell>
  )
}
