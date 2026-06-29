import { ArrowRight, ArrowUpRight } from "lucide-react"
import type { Metadata } from "next"
import { EditorialShell } from "@/components/articles/EditorialShell"
import HeroMarketTicker from "@/components/HeroMarketTicker"
import { HomepageFaq } from "@/components/HomepageFaq"
import HomepageProtocolStats from "@/components/HomepageProtocolStats"
import LatestArticles from "@/components/articles/LatestArticles"
import ScrollRevealStatement from "@/components/ScrollRevealStatement"
import { getPublishedPreviews } from "@/lib/cms/articles"
import { loadInitialHomeStats, loadInitialVolumeStats } from "@/lib/homepage-initial-data"
import { externalAnchorProps } from "@/lib/link-behavior"
import { absoluteUrl, sharedUnfurlImageHeight, sharedUnfurlImageUrl, sharedUnfurlImageWidth, siteName, siteUrl } from "@/lib/seo"

type Locale = "en" | "zh"

const showHeroMarketTicker = process.env.NEXT_PUBLIC_SHOW_HERO_MARKET_TICKER === "true"

const teamMembers = [
  {
    name: "Gabe",
    role: { en: "Founder / CEO", zh: "创始人 / CEO" },
    image: "/Team/gabe.png",
    bio: {
      en: "Former strategy consultant focused on reducing friction in financial products.",
      zh: "前战略顾问，专注降低金融产品中的使用摩擦。",
    },
    href: "https://x.com/gabe_subfrost",
    group: "core",
  },
  {
    name: "Flex",
    role: { en: "Founder / CTO", zh: "创始人 / CTO" },
    image: "/Team/flex.png",
    bio: {
      en: "Crypto engineer since 2016. Creator of Protorunes and Alkanes. Former CTO of Polymarket and IDEX.",
      zh: "自 2016 年以来的加密工程师。Protorunes 与 Alkanes 创建者，曾任 Polymarket 和 IDEX CTO。",
    },
    href: "https://github.com/kungfuflex",
    group: "core",
  },
  {
    name: "Brooks",
    role: { en: "APAC Marketing Director", zh: "亚太市场总监" },
    image: "/Team/brooks.png",
    bio: {
      en: "Decade of Chinese network building and blockchain marketing experience.",
      zh: "拥有十年中国网络建设和区块链营销经验。",
    },
    href: "https://x.com/brooks_subfrost",
    group: "core",
  },
  {
    name: "Casuwu",
    role: { en: "Software Engineer", zh: "软件工程师" },
    image: "/Team/Cas.jpg",
    bio: {
      en: "Built the first staking contract on Bitcoin, UnitVault. Former SWE at Olympus Protocol and Fjord Foundry.",
      zh: "构建了比特币上的首个质押合约 UnitVault。曾任 Olympus Protocol 和 Fjord Foundry 软件工程师。",
    },
    href: "https://x.com/0xcasuwu",
    group: "core",
  },
  {
    name: "Tangata",
    role: { en: "Software Engineer", zh: "软件工程师" },
    image: "/Team/tangata.jpg",
    bio: {
      en: "Early Metashrew adopter and Rebar Labs Bitcoin Hackathon winner for the Acai contract.",
      zh: "Metashrew 早期采用者，凭 Acai 合约赢得 Rebar Labs 比特币黑客松。",
    },
    href: "https://x.com/TangataNui",
    group: "core",
  },
  {
    name: "Shang",
    role: { en: "DevOps Engineer", zh: "DevOps 工程师" },
    image: "/Team/shang.png",
    bio: {
      en: "Early Ordinals builder on Bitcoin with prior DevOps experience at Fjord Foundry.",
      zh: "比特币 Ordinals 早期建设者，曾在 Fjord Foundry 担任 DevOps。",
    },
    href: "https://x.com/ssh_Shang",
    group: "core",
  },
  {
    name: "Domo",
    role: { en: "Advisor", zh: "顾问" },
    image: "/Team/domo.jpg",
    bio: {
      en: "Creator of BRC20, the first token standard on Bitcoin.",
      zh: "BRC20 创建者，比特币上的首个代币标准。",
    },
    href: "https://x.com/domodata",
    group: "advisor",
  },
  {
    name: "Hex",
    role: { en: "Advisor", zh: "顾问" },
    image: "/Team/hex.jpg",
    bio: {
      en: "Founder and CEO of Saturn DEX.",
      zh: "Saturn DEX 创始人兼 CEO。",
    },
    href: "https://x.com/hexbtc",
    group: "advisor",
  },
  {
    name: "Allen",
    role: { en: "Advisor", zh: "顾问" },
    image: "/Team/allen.jpg",
    bio: {
      en: "Founder of Google web3 and partner at Primitive Ventures.",
      zh: "Google web3 创始人，Primitive Ventures 合伙人。",
    },
    href: "https://x.com/allenday",
    group: "advisor",
  },
  {
    name: "Binari",
    role: { en: "Advisor", zh: "顾问" },
    image: "/Team/binari.png",
    bio: {
      en: "Founder and CEO of Best In Slot, creator of BRC2.0.",
      zh: "Best In Slot 创始人兼 CEO，BRC2.0 创建者。",
    },
    href: "https://x.com/0xBinari",
    group: "advisor",
  },
  {
    name: "Mork1e",
    role: { en: "Advisor", zh: "顾问" },
    image: "/Team/mork.jpg",
    bio: {
      en: "Founder of Mezcal, Espo, and Pizza.Fun. Building crypto infrastructure since 2017.",
      zh: "Mezcal、Espo 和 Pizza.Fun 创始人，自 2017 年以来构建加密基础设施。",
    },
    href: "https://x.com/mork1e",
    group: "advisor",
  },
  {
    name: "Eran",
    role: { en: "Advisor", zh: "顾问" },
    image: "/Team/eran.jpeg",
    bio: {
      en: "Serial founder and CEO with multiple cybersecurity exits.",
      zh: "连续创业者和 CEO，拥有多次网络安全公司退出经验。",
    },
    href: "https://www.linkedin.com/in/eransinai/",
    group: "advisor",
  },
] satisfies {
  name: string
  role: Record<Locale, string>
  image: string
  bio: Record<Locale, string>
  href: string
  group: "core" | "advisor"
}[]

type TeamMember = (typeof teamMembers)[number]

function TeamMemberCard({ member, locale }: { member: TeamMember; locale: Locale }) {
  return (
    <a
      href={member.href}
      {...externalAnchorProps(member.href)}
      className="group grid h-full grid-cols-[56px_1fr] gap-4 py-5"
    >
      <img
        src={member.image}
        alt={member.name}
        width={56}
        height={56}
        loading="lazy"
        decoding="async"
        className="h-14 w-14 rounded-full object-cover"
      />
      <span>
        <span className="flex items-center gap-2">
          <span className="font-display text-[19px] leading-none" style={{ color: "var(--ed-ink)" }}>
            {member.name}
          </span>
          <ArrowUpRight className="h-4 w-4 opacity-45 transition-opacity duration-200 group-hover:opacity-100" strokeWidth={1.8} style={{ color: "var(--ed-muted)" }} />
        </span>
        <span className="mt-1 block text-[13px]" style={{ color: "var(--ed-muted)" }}>
          {member.role[locale]}
        </span>
        <span className="mt-2 block text-[14px] leading-[1.45]" style={{ color: "var(--ed-body)" }}>
          {member.bio[locale]}
        </span>
      </span>
    </a>
  )
}

const homeCopy = {
  en: {
    eyebrow: "Bitcoin-native Layer 0",
    title: "subfrost",
    reveal:
      "Trade Bitcoin-native assets and track live BTC markets. Deploy liquidity into AMM pools and vaults on Bitcoin.",
    launch: "Launch App",
    productsHeading: "Built for the Bitcoin operating layer.",
    products: [
      {
        title: "Markets",
        body: "Live BTC, DIESEL, FIRE, and protocol market data with block-height context beside every decision.",
        href: "https://app.subfrost.io/markets",
      },
      {
        title: "Swap",
        body: "Trade Bitcoin-native assets through AMM liquidity while keeping execution paths direct and auditable.",
        href: "https://app.subfrost.io/swap",
      },
      {
        title: "Vaults",
        body: "Put BTC and protocol assets to work through structured vault products without leaving the subfrost app.",
        href: "https://app.subfrost.io/vaults",
      },
    ],
    teamEyebrow: "Team",
    teamHeading: "Builders with protocol credibility.",
    teamBody:
      "The roster brings Alkanes and Protorunes engineering, BRC20 and BRC2.0 advisors, APAC distribution, Ordinals infrastructure, and operators with deployment history.",
    coreTeam: "Core team",
    advisors: "Advisors",
    faqHeading: "FAQ",
    faqItems: [
      {
        question: "What is subfrost?",
        answer: "subfrost is Bitcoin-native infrastructure for issuing assets, routing liquidity, trading through AMMs, and accessing vault products from one app.",
      },
      {
        question: "What products are live on the app?",
        answer: "The product surface centers on Markets, Swap, and Vaults, with live BTC, DIESEL, FIRE, BTC/DIESEL, BTC/FIRE, and block-height data surfaced on the homepage.",
      },
      {
        question: "Is there a mobile app?",
        answer: "Yes. The mobile app is coming soon.",
      },
      {
        question: "Why does subfrost publish articles?",
        answer: "Articles give users the research, protocol context, release notes, and author-backed explanations they need before deploying capital.",
      },
      {
        question: "Where do I start?",
        answer: "Use Launch App for execution, Markets for current pricing and network context, and Articles for protocol research and product updates.",
      },
    ],
  },
  zh: {
    eyebrow: "比特币原生 Layer 0",
    title: "subfrost",
    reveal: "交易比特币原生资产，并跟踪实时 BTC 市场。将流动性部署到比特币上的 AMM 池和金库。",
    launch: "启动应用",
    productsHeading: "比特币操作层。",
    products: [
      {
        title: "市场",
        body: "实时查看 BTC、DIESEL、FIRE 与协议市场数据，并把区块高度放在每次决策旁边。",
        href: "https://app.subfrost.io/markets",
      },
      {
        title: "兑换",
        body: "通过 AMM 流动性交易比特币原生资产，让执行路径更直接、更可审计。",
        href: "https://app.subfrost.io/swap",
      },
      {
        title: "金库",
        body: "在同一个 subfrost 应用中，将 BTC 与协议资产投入结构化金库产品。",
        href: "https://app.subfrost.io/vaults",
      },
    ],
    teamEyebrow: "团队",
    teamHeading: "具备协议可信度的建设者。",
    teamBody:
      "团队阵容覆盖 Alkanes 与 Protorunes 工程、BRC20 与 BRC2.0 顾问、亚太分发、Ordinals 基础设施，以及有部署记录的运营团队。",
    coreTeam: "核心团队",
    advisors: "顾问",
    faqHeading: "常见问题",
    faqItems: [
      {
        question: "subfrost 是什么？",
        answer: "subfrost 是比特币原生基础设施，用于资产发行、流动性路由、AMM 交易和金库产品访问，并统一在一个应用中。",
      },
      {
        question: "应用里有哪些产品？",
        answer: "当前产品界面以市场、兑换和金库为核心，首页展示 BTC、DIESEL、FIRE、BTC/DIESEL、BTC/FIRE 与区块高度数据。",
      },
      {
        question: "有移动应用吗？",
        answer: "有。移动应用即将推出。",
      },
      {
        question: "为什么 subfrost 要发布文章？",
        answer: "文章提供研究、协议背景、发布说明和作者署名解释，让用户在部署资金前理解产品和风险。",
      },
      {
        question: "我应该从哪里开始？",
        answer: "需要执行时进入应用；需要价格和网络上下文时看市场；需要协议研究和产品更新时看文章。",
      },
    ],
  },
} satisfies Record<Locale, {
  eyebrow: string
  title: string
  reveal: string
  launch: string
  productsHeading: string
  products: { title: string; body: string; href: string }[]
  teamEyebrow: string
  teamHeading: string
  teamBody: string
  coreTeam: string
  advisors: string
  faqHeading: string
  faqItems: { question: string; answer: string }[]
}>

const homeSeoCopy = {
  en: {
    title: "subfrost | Bitcoin-native markets, AMM liquidity, and vaults",
    description:
      "Trade Bitcoin-native assets, track live BTC markets, and deploy liquidity into AMM pools and vaults on Bitcoin with subfrost.",
    keywords: [
      "subfrost",
      "Bitcoin DeFi",
      "Bitcoin-native assets",
      "AMM liquidity on Bitcoin",
      "Bitcoin vaults",
      "BTC markets",
      "frBTC",
      "Alkanes",
      "BRC2.0",
    ],
  },
  zh: {
    title: "subfrost | 比特币原生市场、AMM 流动性与金库",
    description: "使用 subfrost 交易比特币原生资产、跟踪实时 BTC 市场，并将流动性部署到比特币上的 AMM 池和金库。",
    keywords: [
      "subfrost",
      "比特币 DeFi",
      "比特币原生资产",
      "比特币 AMM",
      "比特币金库",
      "BTC 市场",
      "frBTC",
      "Alkanes",
      "BRC2.0",
    ],
  },
} satisfies Record<Locale, { title: string; description: string; keywords: string[] }>

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>
}): Promise<Metadata> {
  const params = searchParams ? await searchParams : {}
  const locale: Locale = params.lang === "zh" ? "zh" : "en"
  const seo = homeSeoCopy[locale]
  const url = absoluteUrl(locale === "zh" ? "/?lang=zh" : "/")
  const image = sharedUnfurlImageUrl

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: url,
      languages: {
        en: absoluteUrl("/"),
        zh: absoluteUrl("/?lang=zh"),
        "x-default": absoluteUrl("/"),
      },
    },
    keywords: seo.keywords,
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url,
      siteName: "subfrost",
      images: [{ url: image, width: sharedUnfurlImageWidth, height: sharedUnfurlImageHeight, alt: "subfrost" }],
      locale: locale === "zh" ? "zh_CN" : "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [{ url: image, alt: "subfrost" }],
    },
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>
}) {
  const params = searchParams ? await searchParams : {}
  const locale: Locale = params.lang === "zh" ? "zh" : "en"
  const copy = homeCopy[locale]
  const [initialStats, initialVolumeStats, initialArticles] = await Promise.all([
    loadInitialHomeStats(),
    loadInitialVolumeStats(),
    getPublishedPreviews({ limit: 3, locale, previewFallback: true }).catch(() => []),
  ])
  const coreTeam = teamMembers.filter((member) => member.group === "core")
  const advisors = teamMembers.filter((member) => member.group === "advisor")
  const teamRows = Array.from({ length: Math.max(coreTeam.length, advisors.length) }, (_, index) => ({
    core: coreTeam[index],
    advisor: advisors[index],
  }))
  const pageUrl = absoluteUrl(locale === "zh" ? "/?lang=zh" : "/")
  const homeJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: "subfrost",
        url: siteUrl,
        logo: absoluteUrl("/brand/subfrost/Logos/favicon/logomark-512.png"),
        description: homeSeoCopy[locale].description,
        sameAs: ["https://x.com/subfrost_io", "https://github.com/subfrost"],
        employee: coreTeam.map((member) => ({
          "@type": "Person",
          name: member.name,
          jobTitle: member.role[locale],
          image: absoluteUrl(member.image),
          sameAs: member.href,
        })),
        member: advisors.map((member) => ({
          "@type": "Person",
          name: member.name,
          jobTitle: member.role[locale],
          image: absoluteUrl(member.image),
          sameAs: member.href,
        })),
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: siteName,
        url: siteUrl,
        publisher: { "@id": `${siteUrl}/#organization` },
        inLanguage: locale === "zh" ? "zh-CN" : "en-US",
      },
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: homeSeoCopy[locale].title,
        description: homeSeoCopy[locale].description,
        isPartOf: { "@id": `${siteUrl}/#website` },
        about: { "@id": `${siteUrl}/#organization` },
        inLanguage: locale === "zh" ? "zh-CN" : "en-US",
      },
      {
        "@type": "SoftwareApplication",
        name: "subfrost app",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        url: "https://app.subfrost.io/",
        description: copy.reveal,
        publisher: { "@id": `${siteUrl}/#organization` },
        featureList: copy.products.map((product) => product.title),
      },
      {
        "@type": "ItemList",
        name: locale === "zh" ? "subfrost 产品" : "subfrost products",
        itemListElement: copy.products.map((product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: product.href,
          name: product.title,
          description: product.body,
        })),
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        mainEntity: copy.faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }}
      />
      <style
        dangerouslySetInnerHTML={{
          __html:
            ".homepage-cascade-item,.homepage-cascade-section{opacity:0;transform:translateY(12px)}@media (prefers-reduced-motion:reduce){.homepage-cascade-item,.homepage-cascade-section{opacity:1;transform:none}}",
        }}
      />
      <EditorialShell>
        <main className="homepage-shell relative overflow-hidden" style={{ background: "var(--ed-canvas)" }}>
        <section className="mx-auto max-w-[1440px] px-6 pb-12 pt-14 sm:px-8 sm:pb-16 sm:pt-[88px]">
          <div className="max-w-[980px]">
            <p className="homepage-cascade-item homepage-cascade-0 font-display text-[15px] font-medium" style={{ color: "var(--ed-muted)" }}>
              {copy.eyebrow}
            </p>
            <h1
              className="homepage-cascade-item homepage-cascade-1 font-display mt-5 text-balance text-[58px] font-normal leading-[0.98] sm:text-[86px] lg:text-[112px]"
              style={{ color: "var(--ed-ink)" }}
            >
              {copy.title}
            </h1>
            <div className="homepage-cascade-item homepage-cascade-2 mt-7">
              <ScrollRevealStatement text={copy.reveal} />
            </div>
          </div>

          <div className="homepage-cascade-item homepage-cascade-3 mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <a
              href="https://app.subfrost.io/"
              {...externalAnchorProps("https://app.subfrost.io/")}
              className="font-display inline-flex h-10 w-[132px] items-center justify-center gap-2 rounded-[6px] border px-0 text-[14px] font-medium"
              style={{
                background: "var(--ed-action-bg)",
                color: "var(--ed-action-fg)",
                borderColor: "color-mix(in srgb, var(--ed-canvas) 12%, transparent)",
              }}
            >
              {copy.launch}
              <ArrowUpRight className="h-4 w-4" strokeWidth={2.2} />
            </a>
          </div>

          <div className="homepage-cascade-item homepage-cascade-4 homepage-data-band mt-10 max-w-[940px]">
            <HomepageProtocolStats
              locale={locale}
              initialStats={initialStats}
              initialVolumeStats={initialVolumeStats}
            />
            {showHeroMarketTicker ? (
              <div className="mt-8">
                <HeroMarketTicker locale={locale} initialData={initialStats} />
              </div>
            ) : null}
          </div>

          <div className="homepage-cascade-item homepage-cascade-5 homepage-brand-banner mt-10 aspect-[1794/598] overflow-hidden rounded-[6px]">
            <img
              src="/brand/subfrost/Graphics/jpeg/banner_light.jpg"
              alt=""
              width={1794}
              height={598}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              className="homepage-brand-banner-image h-full w-full object-cover"
            />
          </div>
        </section>

        <section className="homepage-cascade-section mx-auto grid max-w-[1440px] gap-8 px-6 py-12 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-16">
          <div>
            <h2 className="font-display text-[34px] font-normal leading-[1.08] sm:text-[44px]" style={{ color: "var(--ed-ink)" }}>
              {copy.productsHeading}
            </h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            {copy.products.map((item) => (
              <a key={item.title} href={item.href} {...externalAnchorProps(item.href)} className="group">
                <h3 className="font-display text-[21px] font-normal leading-[1.24]" style={{ color: "var(--ed-ink)" }}>
                  {item.title}
                  <ArrowRight className="ml-1 inline h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" strokeWidth={1.7} />
                </h3>
                <p className="mt-3 text-[15px] leading-[1.5]" style={{ color: "var(--ed-muted)" }}>
                  {item.body}
                </p>
              </a>
            ))}
          </div>
        </section>

        <section className="homepage-cascade-section mx-auto max-w-[1440px] px-6 py-12 sm:px-8 lg:py-16">
          <div>
            <p className="font-display text-[15px] font-medium" style={{ color: "var(--ed-muted)" }}>
              {copy.teamEyebrow}
            </p>
            <h2 className="mt-4 max-w-[560px] font-display text-[34px] font-normal leading-[1.08] sm:text-[44px]" style={{ color: "var(--ed-ink)" }}>
              {copy.teamHeading}
            </h2>
            <p className="mt-5 max-w-[780px] text-[18px] leading-[1.5]" style={{ color: "var(--ed-body)" }}>
              {copy.teamBody}
            </p>
          </div>

          <div className="mt-12 hidden lg:block">
            <div className="grid gap-10 lg:grid-cols-2">
              <h3 className="pb-4 font-display text-[15px] font-medium" style={{ color: "var(--ed-muted)" }}>
                {copy.coreTeam}
              </h3>
              <h3 className="pb-4 font-display text-[15px] font-medium" style={{ color: "var(--ed-muted)" }}>
                {copy.advisors}
              </h3>
            </div>
            <div className="grid">
              {teamRows.map((row, index) => (
                <div key={row.core?.name ?? row.advisor?.name ?? index} className="grid gap-10 lg:grid-cols-2">
                  <div>
                    {row.core ? <TeamMemberCard member={row.core} locale={locale} /> : null}
                  </div>
                  <div>
                    {row.advisor ? <TeamMemberCard member={row.advisor} locale={locale} /> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-12 grid gap-10 lg:hidden">
            {[
              { title: copy.coreTeam, members: coreTeam },
              { title: copy.advisors, members: advisors },
            ].map((group) => (
              <div key={group.title}>
                <h3 className="pb-4 font-display text-[15px] font-medium" style={{ color: "var(--ed-muted)" }}>
                  {group.title}
                </h3>
                <div className="grid">
                  {group.members.map((member, index) => (
                    <div key={member.name}>
                      <TeamMemberCard member={member} locale={locale} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="homepage-cascade-section mx-auto max-w-[1440px] px-6 py-12 sm:px-8 lg:py-16">
          <LatestArticles locale={locale} articles={initialArticles} />
        </section>

        <section className="homepage-cascade-section mx-auto grid max-w-[1440px] gap-8 px-6 py-12 sm:px-8 lg:grid-cols-[0.42fr_1.08fr] lg:gap-16 lg:pb-24 lg:pt-16">
          <div>
            <h2 className="font-display text-[34px] font-normal leading-[1.08] sm:text-[44px]" style={{ color: "var(--ed-ink)" }}>
              {copy.faqHeading}
            </h2>
          </div>
          <HomepageFaq items={copy.faqItems} />
        </section>
        </main>
      </EditorialShell>
    </>
  )
}
