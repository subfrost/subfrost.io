import type { Metadata } from "next"
import { EditorialShell } from "@/components/articles/EditorialShell"
import { EcosystemDirectory } from "@/components/ecosystem/EcosystemDirectory"
import { EcosystemNotice } from "@/components/ecosystem/EcosystemNotice"
import { HeroMosaic } from "@/components/ecosystem/HeroMosaic"
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
    submitSubject: "Alkanes ecosystem — listing request",
    submitTemplate: `Hi SUBFROST team,

I'd like to submit a project for the Alkanes ecosystem directory.

• Project name:
• Category (DeFi / Wallet / Tooling / Launchpad / NFT / Gaming / Social / Other):
• Status (Live / Beta / Building):
• Website:
• X (Twitter):
• Docs (optional):
• Alkane id (optional, e.g. 2:0):
• One-line description:
• Anything else we should know:

Thanks!`,
    disclaimer:
      "This directory celebrates what independent teams are building on Alkanes. SUBFROST did not build, does not control, and has not audited these projects. A listing is not an endorsement, a partnership, or a safety review, and nothing on this page is financial advice. Do your own research before you use any of them.",
    projectsWord: "projects",
    categoriesWord: "categories",
    directory: {
      filterAll: "All",
      featuredTag: "Featured",
      website: "Website",
      docs: "Docs",
      tabApps: "Apps",
      tabContracts: "Contracts",
      comingSoon: "Coming soon",
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
    submitSubject: "Alkanes 生态系统 — 收录申请",
    submitTemplate: `你好 SUBFROST 团队，

我想提交一个项目，申请收录到 Alkanes 生态系统目录。

• 项目名称：
• 分类（DeFi / Wallet / Tooling / Launchpad / NFT / Gaming / Social / Other）：
• 状态（Live / Beta / Building）：
• 官网：
• X（Twitter）：
• 文档（可选）：
• Alkane id（可选，例如 2:0）：
• 一句话简介：
• 其他补充信息：

谢谢！`,
    disclaimer:
      "本目录展示独立团队在 Alkanes 上构建的项目。SUBFROST 未构建、不控制、也未审计这些项目。列入本目录并不代表背书、合作或安全审查，本页任何内容也不构成财务建议。在使用任何项目之前，请务必自行研究（DYOR）。",
    projectsWord: "个项目",
    categoriesWord: "个分类",
    directory: {
      filterAll: "全部",
      featuredTag: "精选",
      website: "官网",
      docs: "文档",
      tabApps: "应用",
      tabContracts: "合约",
      comingSoon: "即将推出",
      statuses: { Live: "已上线", Beta: "测试版", Building: "构建中" },
    },
  },
} // one copy object per locale; keep both shapes identical

const SUBMIT_EMAIL = "vitor@subfrost.io"

/** Prefilled mailto for "get listed" — no backend; devs submit details straight to Vitor. */
function submitMailto(subject: string, body: string): string {
  return `mailto:${SUBMIT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

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

  return (
    <EditorialShell>
      <main className="mx-auto w-full max-w-[1280px] px-0 pb-24 pt-8 sm:px-6">
        <section className="grid gap-y-8 px-6 pb-10 pt-8 sm:px-10 sm:pb-12 sm:pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-center lg:gap-x-10">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--ed-muted)]">{c.eyebrow}</p>
            <h1 className="mt-3 max-w-[15ch] text-balance text-[clamp(32px,5vw,54px)] font-normal leading-[1.02] tracking-[-0.025em] text-[color:var(--ed-ink)]">{c.title}</h1>
            <p className="mt-4 max-w-[52ch] text-[16px] leading-[1.55] text-[color:var(--ed-body)]">{c.subtitle}</p>
            <div className="mt-7 flex flex-wrap items-center gap-5">
              <a
                href={submitMailto(c.submitSubject, c.submitTemplate)}
                className="inline-flex items-center gap-2 rounded-[8px] bg-[color:var(--ed-ink)] px-[18px] py-[10px] text-[14px] font-medium text-[color:var(--ed-canvas)] transition-transform hover:-translate-y-px motion-reduce:hover:translate-y-0"
              >
                {c.cta} <span className="text-[color:var(--ed-flare)]">→</span>
              </a>
              <span className="font-mono text-[12.5px] text-[color:var(--ed-muted)]" style={{ fontVariantNumeric: "tabular-nums" }}>
                <b className="font-medium text-[color:var(--ed-ink)]">{projects.length}</b> {c.projectsWord} · <b className="font-medium text-[color:var(--ed-ink)]">{categoryCount}</b> {c.categoriesWord}
              </span>
            </div>
          </div>
          <HeroMosaic projects={projects} />
        </section>

        <EcosystemNotice text={c.disclaimer} className="mx-6 mb-8 sm:mx-10" />

        <EcosystemDirectory projects={projects} featuredBandEnabled={featuredBandEnabled} copy={c.directory} />
      </main>
    </EditorialShell>
  )
}
