import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { EditorialShell } from "@/components/articles/EditorialShell"
import { EcosystemProfile, type ProfileCopy } from "@/components/ecosystem/EcosystemProfile"
import { StatHero, type StatHeroCopy } from "@/components/ecosystem/StatHero"
import { PriceChart } from "@/components/ecosystem/PriceChart"
import { getEcosystemProfile, getEcosystemStatsWithDelta } from "@/lib/ecosystem/public"
import { getEcosystemPriceSeries } from "@/lib/ecosystem/candles"
import { fetchVerifiedSource } from "@/lib/ecosystem/verified-source"
import { absoluteUrl } from "@/lib/seo"

export const dynamic = "force-dynamic"

type Locale = "en" | "zh"

const copy: Record<Locale, ProfileCopy> = {
  en: {
    back: "← Ecosystem",
    disclaimer: "This is an independent third-party project. SUBFROST did not build, does not control, and has not audited it. Listing is not an endorsement, and nothing here is financial advice. Do your own research.",
    website: "Website", docs: "Docs", overview: "Overview",
    contractsTitle: "Contracts", contractCol: "Contract", idCol: "Alkane ID", notesCol: "Notes",
    sourceTab: "Source",
    source: {
      verifiedSourceTitle: "Verified source",
      verdictReproducible: "Reproducible",
      verdictVerified: "Verified",
      verdictReproducibleNote: "The explorer rebuilt this contract from source in a pinned sandbox, and the result is byte-exact to the bytecode on chain.",
      verdictVerifiedNote: "Logic and structure match the source exactly. A few bytes of build metadata differ, which is what a foreign build host leaves behind.",
      matchLabel: "Byte match",
      reproducedFrom: "Reproduced from",
      commitLabel: "Commit",
      browseOnExplorer: "Browse the source on the explorer",
    },
    statuses: { Live: "Live", Beta: "Beta", Building: "Building" },
    stats: { holders: "Holders", supply: "Supply", price: "Price (USD)" },
    chart: { title: "Price (90d)" },
  },
  zh: {
    back: "← 生态系统",
    disclaimer: "这是一个独立的第三方项目。SUBFROST 未构建、不控制、也未审计它。列入本目录不代表背书，本页内容也不构成财务建议。请务必自行研究（DYOR）。",
    website: "官网", docs: "文档", overview: "概览",
    contractsTitle: "合约", contractCol: "合约", idCol: "Alkane ID", notesCol: "说明",
    sourceTab: "源码",
    source: {
      verifiedSourceTitle: "已验证源码",
      verdictReproducible: "可复现",
      verdictVerified: "已验证",
      verdictReproducibleNote: "SUBFROST Explorer 在固定环境的沙箱中从源码重新构建了该合约，结果与链上字节码逐字节一致。",
      verdictVerifiedNote: "逻辑与结构和源码完全一致，仅有几个字节的构建元数据存在差异，这是不同构建主机留下的痕迹。",
      matchLabel: "字节匹配度",
      reproducedFrom: "复现自",
      commitLabel: "提交",
      browseOnExplorer: "在 SUBFROST Explorer 中查看源码",
    },
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
  // Decorative like statHero and priceChart: a failed or missing attestation must never take
  // down a profile, so this collapses to null. Cached for an hour inside fetchVerifiedSource.
  const verified = p.alkaneId ? await fetchVerifiedSource(p.alkaneId).catch(() => null) : null
  const backHref = locale === "zh" ? "/ecosystem?lang=zh" : "/ecosystem"
  return (
    <EditorialShell>
      <main className="mx-auto w-full max-w-[880px] px-6 pb-24 pt-10 sm:px-10">
        <EcosystemProfile
          p={p} copy={copy[locale]} backHref={backHref}
          statHero={<StatHero stats={s?.current ?? null} baseline={s?.baseline ?? null} periodLabel={s?.periodLabel ?? null} mainAlkaneId={p.alkaneId} showMarketStats={p.showMarketStats} copy={copy[locale].stats} locale={locale} />}
          priceChart={series ? <PriceChart points={series} copy={copy[locale].chart} locale={locale} /> : null}
          verified={verified}
        />
      </main>
    </EditorialShell>
  )
}
