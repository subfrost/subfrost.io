import type { Metadata } from "next"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { EditorialShell } from "@/components/articles/EditorialShell"
import { externalLinks } from "@/lib/external-links"
import { externalAnchorProps, isExternalHref } from "@/lib/link-behavior"
import { absoluteUrl, sharedUnfurlImageHeight, sharedUnfurlImageUrl, sharedUnfurlImageWidth, siteName, siteUrl } from "@/lib/seo"

type Locale = "en" | "zh"

const docsUrl = externalLinks.docs
const apiUrl = externalLinks.apiDocs
const apiLoginUrl = externalLinks.apiLogin
const appUrl = externalLinks.app

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
      images: [{ url: sharedUnfurlImageUrl, width: sharedUnfurlImageWidth, height: sharedUnfurlImageHeight, alt: "subfrost" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [sharedUnfurlImageUrl],
    },
  }
}

const copy = {
  en: {
    title: "Developer",
    intro:
      "Build with subfrost to unlock BTC liquidity without sacrificing UX.",
    nav: [
      { label: "Overview", href: "#overview" },
      { label: "Docs", href: docsUrl },
      { label: "API docs", href: apiUrl },
      { label: "API login", href: apiLoginUrl },
    ],
    heroKicker: "Start here",
    heroTitle: "Bitcoin-native infrastructure, documented clearly.",
    heroBody:
      "This page is the developer front door. Deep technical references stay on the live docs and API systems so operators can use the source of truth.",
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
        title: "API docs",
        body: "Entry points for app development and Bitcoin-native integrations.",
        meta: "developer API",
        href: apiUrl,
        variant: 4,
      },
      {
        title: "API login",
        body: "Access the live API dashboard.",
        meta: "developer access",
        href: apiLoginUrl,
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
      { label: "API 登录", href: apiLoginUrl },
    ],
    heroKicker: "从这里开始",
    heroTitle: "面向比特币原生基础设施的清晰文档入口。",
    heroBody:
      "这个页面是 git 管理的开发者入口。深入技术参考保留在实时文档与 API 系统中，方便运营使用单一事实来源。",
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
        title: "API 文档",
        body: "应用开发与比特币原生集成的入口。",
        meta: "开发者 API",
        href: apiUrl,
        variant: 4,
      },
      {
        title: "API 登录",
        body: "访问实时 API 控制台。",
        meta: "开发者访问",
        href: apiLoginUrl,
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
          <div className="mx-auto max-w-[1440px] px-6 pb-16 pt-5 sm:px-8 sm:pb-24 sm:pt-[33px]">
            <div className="max-w-[780px]">
              <h1 className="font-display text-[38px] font-normal leading-[1.06] sm:text-[52px]" style={{ color: "var(--ed-ink)" }}>
                {t.title}
              </h1>
              <p className="font-display mt-4 max-w-[720px] text-[18px] leading-[1.55]" style={{ color: "var(--ed-body)" }}>
                {t.intro}
              </p>
              <nav className="mt-9 flex flex-wrap gap-x-7 gap-y-3">
                {t.nav.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    {...externalAnchorProps(item.href)}
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
            <div className="ed-cover ed-cover-frame aspect-[16/10]">
              <picture>
                <source
                  srcSet="/articles/developer-hero-ice-480.webp 480w, /articles/developer-hero-ice-960.webp 960w, /articles/developer-hero-ice-1536.webp 1536w"
                  sizes="(min-width: 1024px) 44vw, 100vw"
                  type="image/webp"
                />
                <img
                  src="/articles/developer-hero-ice.png"
                  alt=""
                  width={1536}
                  height={960}
                  decoding="async"
                  fetchPriority="high"
                  loading="eager"
                  style={{ objectPosition: "top" }}
                />
              </picture>
            </div>
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
              {t.cards.map((card, i) => (
                <a
                  key={card.href}
                  href={card.href}
                  {...externalAnchorProps(card.href)}
                  className="ed-card"
                >
                  <div className="ed-cover ed-cover-frame aspect-[4/3]">
                    <picture>
                      <source
                        srcSet={`/articles/developer-card-ice-${i + 1}-480.webp 480w, /articles/developer-card-ice-${i + 1}-960.webp 960w, /articles/developer-card-ice-${i + 1}-1200.webp 1200w`}
                        sizes="(min-width: 768px) 28vw, 100vw"
                        type="image/webp"
                      />
                      <img
                        src={`/articles/developer-card-ice-${i + 1}.png`}
                        alt=""
                        width={1200}
                        height={900}
                        decoding="async"
                        loading="lazy"
                      />
                    </picture>
                  </div>
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

        <section id="support">
          <div className="mx-auto grid max-w-[1440px] gap-9 px-6 pb-16 sm:px-8 sm:pb-24 lg:grid-cols-[260px_minmax(0,720px)]">
            <h2 className="font-display text-[32px] font-medium leading-tight" style={{ color: "var(--ed-ink)" }}>
              {t.supportTitle}
            </h2>
            <div>
              <p className="font-display text-[18px] leading-[1.55]" style={{ color: "var(--ed-body)" }}>
                {t.supportBody}
              </p>
              <a href={locale === "zh" ? "/support?lang=zh" : "/support"} className="font-display mt-6 inline-flex items-center text-[16px] font-medium" style={{ color: "var(--ed-ink)" }}>
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
