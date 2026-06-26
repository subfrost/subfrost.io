import type { Metadata } from "next"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { EditorialShell } from "@/components/articles/EditorialShell"
import { CoverArt } from "@/components/articles/CoverArt"
import { absoluteUrl, sharedUnfurlImagePath, siteName, siteUrl } from "@/lib/seo"

type Locale = "en" | "zh"

const docsUrl = "/docs"
const technicalUrl = "/docs/introduction/technical-overview"
const apiUrl = "/docs/introduction/api-docs"
const appUrl = "https://app.subfrost.io/"

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}): Promise<Metadata> {
  const { lang } = await searchParams
  const locale: Locale = lang === "zh" ? "zh" : "en"
  const title = locale === "zh" ? "开发者 | subfrost" : "Developer | subfrost"
  const description =
    locale === "zh"
      ? "subfrost 开发者入口，包含技术概览、API 文档、协议参考与应用入口。"
      : "The subfrost developer gateway for technical overview, API docs, protocol references, and app entry points."
  const url = locale === "zh" ? "https://subfrost.io/developer?lang=zh" : "https://subfrost.io/developer"

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        en: "https://subfrost.io/developer",
        zh: "https://subfrost.io/developer?lang=zh",
        "x-default": "https://subfrost.io/developer",
      },
    },
    openGraph: {
      title,
      description,
      type: "website",
      url,
      siteName: "subfrost",
      images: [{ url: sharedUnfurlImagePath, alt: "subfrost" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [sharedUnfurlImagePath],
    },
  }
}

const copy = {
  en: {
    title: "Developer",
    intro:
      "Build against subfrost with the technical overview, API references, protocol notes, and product entry points in one place.",
    nav: [
      { label: "Overview", href: "#overview" },
      { label: "Docs", href: docsUrl },
      { label: "API docs", href: apiUrl },
      { label: "Support", href: "/support" },
    ],
    heroKicker: "Start here",
    heroTitle: "Bitcoin-native infrastructure, documented clearly.",
    heroBody:
      "This page is the git-managed developer front door. The docs now live in this repo so protocol, product, and integration material can share one designed system.",
    docsTitle: "Core references",
    docsBody: "Primary paths for engineers, partners, and protocol reviewers.",
    protocolTitle: "Protocol surfaces",
    protocolBody: "The current product surface is split between the live app, technical docs, and protocol updates.",
    supportTitle: "Need access?",
    supportBody: "Use support for account, docs, or product access issues.",
    cards: [
      {
        title: "Docs",
        body: "Product guides, setup paths, and protocol references.",
        meta: "subfrost docs",
        href: docsUrl,
        variant: 3,
      },
      {
        title: "Technical overview",
        body: "Layer-0 architecture, fraud proofs, and ZK verification model.",
        meta: "technical reference",
        href: technicalUrl,
        variant: 4,
      },
      {
        title: "API docs",
        body: "Entry points for app development and Bitcoin-native integrations.",
        meta: "developer API",
        href: apiUrl,
        variant: 5,
      },
    ],
    surfaces: [
      { title: "Launch App", meta: "Live product", href: appUrl },
      { title: "Protocol updates", meta: "Research and releases", href: "/articles?topic=protocol" },
      { title: "Support", meta: "Access and product help", href: "/support" },
    ],
  },
  zh: {
    title: "开发者",
    intro: "集中查看 subfrost 技术概览、API 文档、协议说明与产品入口。",
    nav: [
      { label: "概览", href: "#overview" },
      { label: "文档", href: docsUrl },
      { label: "API", href: apiUrl },
      { label: "支持", href: "/support?lang=zh" },
    ],
    heroKicker: "从这里开始",
    heroTitle: "面向比特币原生基础设施的清晰文档入口。",
    heroBody:
      "这个页面是 git 管理的开发者入口。文档现在由此仓库承载，让协议、产品与集成资料共享统一设计系统。",
    docsTitle: "核心参考",
    docsBody: "面向工程师、合作伙伴与协议评审的主要路径。",
    protocolTitle: "协议入口",
    protocolBody: "当前产品入口分布在实时应用、技术文档与协议更新中。",
    supportTitle: "需要访问权限？",
    supportBody: "如遇账户、文档或产品访问问题，可通过支持页面联系团队。",
    cards: [
      {
        title: "文档",
        body: "产品指南、设置路径与协议参考。",
        meta: "subfrost 文档",
        href: docsUrl,
        variant: 3,
      },
      {
        title: "技术概览",
        body: "Layer-0 架构、欺诈证明与 ZK 验证模型。",
        meta: "技术参考",
        href: technicalUrl,
        variant: 4,
      },
      {
        title: "API 文档",
        body: "应用开发与比特币原生集成的入口。",
        meta: "开发者 API",
        href: apiUrl,
        variant: 5,
      },
    ],
    surfaces: [
      { title: "启动应用", meta: "实时产品", href: appUrl },
      { title: "协议更新", meta: "研究与发布", href: "/articles?topic=protocol&lang=zh" },
      { title: "支持", meta: "访问与产品帮助", href: "/support?lang=zh" },
    ],
  },
} satisfies Record<Locale, {
  title: string
  intro: string
  nav: Array<{ label: string; href: string }>
  heroKicker: string
  heroTitle: string
  heroBody: string
  docsTitle: string
  docsBody: string
  protocolTitle: string
  protocolBody: string
  supportTitle: string
  supportBody: string
  cards: Array<{ title: string; body: string; meta: string; href: string; variant: number }>
  surfaces: Array<{ title: string; meta: string; href: string }>
}>

function isExternalHref(href: string) {
  return /^https?:\/\//.test(href)
}

function LinkArrow({ external }: { external: boolean }) {
  const Icon = external ? ArrowUpRight : ArrowRight
  return (
    <Icon
      aria-hidden="true"
      className="ml-1 inline-block h-[0.82em] w-[0.82em] translate-y-[-0.08em]"
      strokeWidth={2}
    />
  )
}

export default async function DeveloperPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}) {
  const { lang } = await searchParams
  const locale: Locale = lang === "zh" ? "zh" : "en"
  const t = copy[locale]
  const pageUrl = absoluteUrl(locale === "zh" ? "/developer?lang=zh" : "/developer")
  const developerJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: locale === "zh" ? "subfrost 开发者" : "subfrost Developer",
    description: t.intro,
    url: pageUrl,
    inLanguage: locale === "zh" ? "zh-CN" : "en-US",
    isPartOf: {
      "@type": "WebSite",
      name: siteName,
      url: siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "subfrost",
      url: siteUrl,
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: [...t.cards, ...t.surfaces].map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(item.href),
        name: item.title,
        description: "body" in item ? item.body : item.meta,
      })),
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(developerJsonLd) }}
      />
      <EditorialShell>
        <main>
        <section>
          <div className="mx-auto max-w-[1440px] px-6 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-[104px]">
            <div className="max-w-[780px]">
              <h1 className="font-display text-[56px] font-normal leading-none sm:text-[76px]" style={{ color: "var(--ed-ink)" }}>
                {t.title}
              </h1>
              <p className="font-display mt-6 max-w-[720px] text-[20px] leading-[1.45] sm:text-[24px]" style={{ color: "var(--ed-body)" }}>
                {t.intro}
              </p>
              <nav className="mt-9 flex flex-wrap gap-x-7 gap-y-3">
                {t.nav.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    target={isExternalHref(item.href) ? "_blank" : undefined}
                    rel={isExternalHref(item.href) ? "noopener noreferrer" : undefined}
                    className="font-display inline-flex items-center text-[17px]"
                    style={{ color: "var(--ed-muted)" }}
                  >
                    {item.label}
                    {item.href !== "#overview" ? <LinkArrow external={isExternalHref(item.href)} /> : null}
                  </a>
                ))}
              </nav>
            </div>
          </div>
        </section>

        <section id="overview">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-6 pb-20 sm:px-8 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)] lg:items-end">
            <div>
              <p className="font-display text-[15px] font-medium" style={{ color: "var(--ed-muted)" }}>
                {t.heroKicker}
              </p>
              <h2 className="font-display mt-5 max-w-[680px] text-[38px] font-normal leading-[1.06] sm:text-[56px]" style={{ color: "var(--ed-ink)" }}>
                {t.heroTitle}
              </h2>
              <p className="font-display mt-5 max-w-[620px] text-[18px] leading-[1.55]" style={{ color: "var(--ed-body)" }}>
                {t.heroBody}
              </p>
            </div>
            <CoverArt
              variant={7}
              priority
              sizes="(min-width: 1024px) 44vw, 100vw"
              className="ed-cover-frame aspect-[16/10]"
            />
          </div>
        </section>

        <section id="docs">
          <div className="mx-auto grid max-w-[1440px] gap-9 px-6 pb-20 sm:px-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div>
              <h2 className="font-display text-[32px] font-medium leading-tight" style={{ color: "var(--ed-ink)" }}>
                {t.docsTitle}
              </h2>
              <p className="font-display mt-4 text-[17px] leading-[1.55]" style={{ color: "var(--ed-body)" }}>
                {t.docsBody}
              </p>
            </div>
            <div className="grid gap-9 md:grid-cols-3">
              {t.cards.map((card) => (
                <a
                  key={card.href}
                  href={card.href}
                  target={isExternalHref(card.href) ? "_blank" : undefined}
                  rel={isExternalHref(card.href) ? "noopener noreferrer" : undefined}
                  className="ed-card"
                >
                  <CoverArt variant={card.variant} sizes="(min-width: 768px) 28vw, 100vw" className="ed-cover-frame aspect-[4/3]" />
                  <div className="pt-5">
                    <h3 className="font-display text-[22px] font-normal leading-tight" style={{ color: "var(--ed-ink)" }}>
                      {card.title}
                      <LinkArrow external={isExternalHref(card.href)} />
                    </h3>
                    <p className="font-display mt-3 text-[15px] leading-[1.48]" style={{ color: "var(--ed-body)" }}>
                      {card.body}
                    </p>
                    <p className="font-display mt-5 text-[14px] font-medium" style={{ color: "var(--ed-muted)" }}>
                      {card.meta}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="api">
          <div className="mx-auto grid max-w-[1440px] gap-9 px-6 pb-20 sm:px-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div>
              <h2 className="font-display text-[32px] font-medium leading-tight" style={{ color: "var(--ed-ink)" }}>
                {t.protocolTitle}
              </h2>
              <p className="font-display mt-4 text-[17px] leading-[1.55]" style={{ color: "var(--ed-body)" }}>
                {t.protocolBody}
              </p>
            </div>
            <div className="grid gap-7 md:grid-cols-3">
              {t.surfaces.map((surface) => (
                <a
                  key={surface.href}
                  href={surface.href}
                  target={isExternalHref(surface.href) ? "_blank" : undefined}
                  rel={isExternalHref(surface.href) ? "noopener noreferrer" : undefined}
                  className="group block"
                >
                  <h3 className="font-display text-[24px] font-normal leading-tight" style={{ color: "var(--ed-ink)" }}>
                    {surface.title}
                    <LinkArrow external={isExternalHref(surface.href)} />
                  </h3>
                  <p className="font-display mt-3 text-[15px] font-medium" style={{ color: "var(--ed-muted)" }}>
                    {surface.meta}
                  </p>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="support">
          <div className="mx-auto grid max-w-[1440px] gap-9 px-6 pb-16 sm:px-8 sm:pb-24 lg:grid-cols-[260px_minmax(0,720px)]">
            <h2 className="font-display text-[32px] font-medium leading-tight" style={{ color: "var(--ed-ink)" }}>
              {t.supportTitle}
            </h2>
            <div>
              <p className="font-display text-[18px] leading-[1.55]" style={{ color: "var(--ed-body)" }}>
                {t.supportBody}
              </p>
              <a href={locale === "zh" ? "/support?lang=zh" : "/support"} className="font-display mt-6 inline-flex text-[16px] font-medium" style={{ color: "var(--ed-ink)" }}>
                {locale === "zh" ? "支持" : "Support"}
                <LinkArrow external={false} />
              </a>
            </div>
          </div>
        </section>
        </main>
      </EditorialShell>
    </>
  )
}
