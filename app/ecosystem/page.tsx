import type { Metadata } from "next"
import { EditorialShell } from "@/components/articles/EditorialShell"
import { EcosystemDirectory } from "@/components/ecosystem/EcosystemDirectory"
import { getEcosystemDirectory } from "@/lib/ecosystem/public"
import { absoluteUrl } from "@/lib/seo"

export const dynamic = "force-dynamic"

type Locale = "en" | "zh"

const copy = {
  en: {
    metaTitle: "The Alkanes ecosystem — projects building on Bitcoin",
    metaDescription: "Every project building on Alkanes — wallets, DeFi, launchpads and tooling for smart contracts on Bitcoin L1. One page, always current.",
    eyebrow: "Alkanes · ecosystem",
    title: "Everything being built on Alkanes",
    subtitle: "Smart contracts on Bitcoin L1 — and the wallets, exchanges, launchpads and tools shipping on them. Find a project, click through, dive in.",
    cta: "Building here? Get listed",
    projectsWord: "projects",
    categoriesWord: "categories",
    directory: {
      filterAll: "All",
      featuredTag: "Featured",
      website: "Website",
      docs: "Docs",
      statuses: { Live: "Live", Beta: "Beta", Building: "Building" },
    },
  },
  zh: {
    metaTitle: "Alkanes 生态系统 — 构建在比特币上的项目",
    metaDescription: "所有基于 Alkanes 构建的项目——比特币主链智能合约的钱包、DeFi、发行平台与工具，一页尽览，持续更新。",
    eyebrow: "Alkanes · 生态系统",
    title: "Alkanes 上正在构建的一切",
    subtitle: "比特币主链上的智能合约，以及围绕它们的钱包、交易、发行平台与工具。找到项目，点击进入，即刻参与。",
    cta: "在 Alkanes 上构建？申请收录",
    projectsWord: "个项目",
    categoriesWord: "个分类",
    directory: {
      filterAll: "全部",
      featuredTag: "精选",
      website: "官网",
      docs: "文档",
      statuses: { Live: "已上线", Beta: "测试版", Building: "构建中" },
    },
  },
} // one copy object per locale; keep both shapes identical

const GET_LISTED_URL = "https://x.com/SUBFROSTio"

export async function generateMetadata({ searchParams }: { searchParams?: Promise<{ lang?: string }> }): Promise<Metadata> {
  const params = searchParams ? await searchParams : {}
  const locale: Locale = params.lang === "zh" ? "zh" : "en"
  const c = copy[locale]
  return {
    title: c.metaTitle,
    description: c.metaDescription,
    alternates: {
      canonical: absoluteUrl("/ecosystem"),
      languages: { en: absoluteUrl("/ecosystem"), zh: absoluteUrl("/ecosystem?lang=zh"), "x-default": absoluteUrl("/ecosystem") },
    },
  }
}

export default async function EcosystemPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const params = searchParams ? await searchParams : {}
  const locale: Locale = params.lang === "zh" ? "zh" : "en"
  const c = copy[locale]
  const { projects, featuredBandEnabled } = await getEcosystemDirectory(locale)
  const categoryCount = new Set(projects.map((p) => p.category)).size

  // Interim text-only hero on the theme background (no image/logomark, no cover
  // band) — the design team owns the final hero art later.
  return (
    <EditorialShell>
      <main className="mx-auto w-full max-w-[1280px] px-0 pb-24 pt-8 sm:px-6">
        <section className="px-6 pb-10 pt-8 sm:px-10 sm:pb-12 sm:pt-10">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--ed-muted)]">{c.eyebrow}</p>
          <h1 className="mt-3 max-w-[15ch] text-balance text-[clamp(32px,5vw,54px)] font-normal leading-[1.02] tracking-[-0.025em] text-[color:var(--ed-ink)]">{c.title}</h1>
          <p className="mt-4 max-w-[52ch] text-[16px] leading-[1.55] text-[color:var(--ed-body)]">{c.subtitle}</p>
          <div className="mt-7 flex flex-wrap items-center gap-5">
            <a
              href={GET_LISTED_URL} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-[8px] bg-[color:var(--ed-ink)] px-[18px] py-[10px] text-[14px] font-medium text-[color:var(--ed-canvas)] transition-transform hover:-translate-y-px motion-reduce:hover:translate-y-0"
            >
              {c.cta} <span className="text-[color:var(--ed-flare)]">→</span>
            </a>
            <span className="font-mono text-[12.5px] text-[color:var(--ed-muted)]" style={{ fontVariantNumeric: "tabular-nums" }}>
              <b className="font-medium text-[color:var(--ed-ink)]">{projects.length}</b> {c.projectsWord} · <b className="font-medium text-[color:var(--ed-ink)]">{categoryCount}</b> {c.categoriesWord}
            </span>
          </div>
        </section>

        <EcosystemDirectory projects={projects} featuredBandEnabled={featuredBandEnabled} copy={c.directory} />
      </main>
    </EditorialShell>
  )
}
