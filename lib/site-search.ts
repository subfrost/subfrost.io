import { docPages } from "@/lib/docs/content"
import { getPublishedPreviews, type CmsLocale } from "@/lib/cms/articles"

export type SiteSearchType = "page" | "product" | "docs" | "article" | "author"

export type SiteSearchResult = {
  id: string
  type: SiteSearchType
  title: string
  description: string
  href: string
  section: string
}

type SearchableEntry = SiteSearchResult & {
  keywords: string
  priority: number
}

const staticCopy = {
  en: {
    home: {
      title: "subfrost",
      description: "Bitcoin-native markets, AMM liquidity, vaults, articles, and live protocol data.",
      keywords: "home bitcoin defi btc markets amm liquidity vaults frbtc diesel fire",
    },
    articles: {
      title: "Articles",
      description: "Research, releases, and field notes from subfrost.",
      keywords: "articles research releases field notes blog editorial bitcoin protocol",
    },
    developer: {
      title: "Gateway",
      description: "Technical overview, API references, protocol notes, and app entry points.",
      keywords: "developer gateway docs api reference integrations alkanes brc2 brc20",
    },
    docs: {
      title: "Docs",
      description: "Product guides, setup paths, protocol references, and technical components.",
      keywords: "docs documentation product guides protocol technical overview",
    },
    volume: {
      title: "Volume",
      description: "Wrap and unwrap volume across Both, Alkanes, and BRC2.0 sources.",
      keywords: "volume charts wraps unwraps both alkanes brc2 brc20 tradingview",
    },
    markets: {
      title: "Markets",
      description: "Live BTC markets and protocol data.",
      keywords: "markets btc usd diesel fire block height metashrew price",
    },
    swap: {
      title: "Swap",
      description: "AMM liquidity for Bitcoin-native assets.",
      keywords: "swap amm liquidity bitcoin assets trade pool",
    },
    vaults: {
      title: "Vaults",
      description: "Structured vault products for BTC and protocol assets.",
      keywords: "vaults yield btc frbtc dxbtc fire diesel staking",
    },
    support: {
      title: "Support",
      description: "Get help with subfrost products, docs, and integrations.",
      keywords: "support help contact assistance",
    },
    brand: {
      title: "Brand kit",
      description: "subfrost logos, marks, and brand assets.",
      keywords: "brand kit logo logos marks assets",
    },
    privacy: {
      title: "Privacy",
      description: "Privacy terms for subfrost web properties.",
      keywords: "privacy data policy",
    },
    terms: {
      title: "Terms",
      description: "Terms for using subfrost products and web properties.",
      keywords: "terms legal conditions",
    },
  },
  zh: {
    home: {
      title: "subfrost",
      description: "比特币原生市场、AMM 流动性、金库、文章与实时协议数据。",
      keywords: "主页 比特币 defi btc 市场 amm 流动性 金库 frbtc diesel fire",
    },
    articles: {
      title: "文章",
      description: "来自 subfrost 的研究、发布与现场笔记。",
      keywords: "文章 研究 发布 笔记 博客 协议",
    },
    developer: {
      title: "入口",
      description: "技术概览、API 参考、协议说明与应用入口。",
      keywords: "开发者 入口 文档 api 参考 集成 alkanes brc2 brc20",
    },
    docs: {
      title: "文档",
      description: "产品指南、设置路径、协议参考与技术组件。",
      keywords: "文档 产品 指南 协议 技术 概览",
    },
    volume: {
      title: "交易量",
      description: "查看 Both、Alkanes 与 BRC2.0 的包装与解包交易量。",
      keywords: "交易量 图表 包装 解包 alkanes brc2 brc20",
    },
    markets: {
      title: "市场",
      description: "实时 BTC 市场与协议数据。",
      keywords: "市场 btc usd diesel fire 区块高度 价格",
    },
    swap: {
      title: "兑换",
      description: "面向比特币原生资产的 AMM 流动性。",
      keywords: "兑换 amm 流动性 比特币 资产 交易 池",
    },
    vaults: {
      title: "金库",
      description: "面向 BTC 与协议资产的结构化金库产品。",
      keywords: "金库 收益 btc frbtc dxbtc fire diesel 质押",
    },
    support: {
      title: "支持",
      description: "获取 subfrost 产品、文档与集成支持。",
      keywords: "支持 帮助 联系",
    },
    brand: {
      title: "品牌套件",
      description: "subfrost 标志、图形与品牌资产。",
      keywords: "品牌 logo 标志 资产",
    },
    privacy: {
      title: "隐私",
      description: "subfrost 网站隐私条款。",
      keywords: "隐私 数据 政策",
    },
    terms: {
      title: "条款",
      description: "使用 subfrost 产品和网站的条款。",
      keywords: "条款 法律 条件",
    },
  },
} satisfies Record<CmsLocale, Record<string, { title: string; description: string; keywords: string }>>

function localizeHref(href: string, locale: CmsLocale) {
  if (href.startsWith("http")) return href
  if (locale === "en") return href
  const separator = href.includes("?") ? "&" : "?"
  return `${href}${separator}lang=zh`
}

function docText(page: (typeof docPages)[number]) {
  return page.blocks
    .map((block) => {
      if (block.type === "p") return block.text
      if (block.type === "list") return block.items.join(" ")
      if (block.type === "table") return block.rows.flat().join(" ")
      return block.code
    })
    .join(" ")
}

function normalize(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
}

function tokenize(input: string) {
  return normalize(input)
    .split(/[^a-z0-9\u4e00-\u9fff.]+/i)
    .map((term) => term.trim())
    .filter(Boolean)
}

function scoreEntry(entry: SearchableEntry, terms: string[]) {
  if (terms.length === 0) return 0
  const title = normalize(entry.title)
  const description = normalize(entry.description)
  const section = normalize(entry.section)
  const haystack = normalize(`${entry.title} ${entry.description} ${entry.section} ${entry.keywords}`)
  const score = terms.reduce((total, term) => {
    if (!haystack.includes(term)) return total
    let next = total + 1
    if (title.includes(term)) next += title.startsWith(term) ? 8 : 5
    if (section.includes(term)) next += 2
    if (description.includes(term)) next += 2
    return next
  }, 0)
  return score + entry.priority
}

function staticEntries(locale: CmsLocale): SearchableEntry[] {
  const copy = staticCopy[locale]
  const entries: SearchableEntry[] = [
    { id: "home", type: "page", section: "subfrost", href: "/", priority: 4, ...copy.home },
    { id: "markets", type: "product", section: "Trade", href: "https://app.subfrost.io/markets", priority: 5, ...copy.markets },
    { id: "swap", type: "product", section: "Trade", href: "https://app.subfrost.io/swap", priority: 5, ...copy.swap },
    { id: "vaults", type: "product", section: "Trade", href: "https://app.subfrost.io/vaults", priority: 5, ...copy.vaults },
    { id: "volume", type: "product", section: "Trade", href: "/volume", priority: 4, ...copy.volume },
    { id: "developer", type: "page", section: "Developer", href: "/developer", priority: 5, ...copy.developer },
    { id: "docs", type: "docs", section: "Developer", href: "/docs", priority: 4, ...copy.docs },
    { id: "articles", type: "page", section: "Articles", href: "/articles", priority: 4, ...copy.articles },
    { id: "support", type: "page", section: "Company", href: "/support", priority: 1, ...copy.support },
    { id: "brand", type: "page", section: "Company", href: "/brand", priority: 1, ...copy.brand },
    { id: "privacy", type: "page", section: "Company", href: "/privacy", priority: 1, ...copy.privacy },
    { id: "terms", type: "page", section: "Company", href: "/terms", priority: 1, ...copy.terms },
  ]
  return entries.map((entry) => ({ ...entry, href: localizeHref(entry.href, locale) }))
}

export async function buildSiteSearchIndex(opts: {
  locale?: CmsLocale
  previewFallback?: boolean
} = {}): Promise<SearchableEntry[]> {
  const locale = opts.locale ?? "en"
  const articles = await getPublishedPreviews({
    limit: 50,
    locale,
    previewFallback: opts.previewFallback,
  }).catch(() => [])

  return [
    ...staticEntries(locale),
    ...docPages.map((page) => ({
      id: `docs:${page.slug}`,
      type: "docs" as const,
      title: page.title,
      description: page.description,
      section: page.section,
      href: localizeHref(`/docs/${page.slug}`, locale),
      keywords: `${page.sourceUrl} ${docText(page)}`,
      priority: 3,
    })),
    ...articles.map((article) => ({
      id: `article:${article.slug}`,
      type: "article" as const,
      title: article.title,
      description: article.excerpt,
      section: "Articles",
      href: localizeHref(`/articles/${article.slug}`, locale),
      keywords: [
        article.author.name,
        article.author.bio ?? "",
        ...article.tags.flatMap((tag) => [tag.name, tag.slug]),
      ].join(" "),
      priority: 3,
    })),
    ...articles.map((article) => ({
      id: `author:${article.author.id}`,
      type: "author" as const,
      title: article.author.name,
      description: article.author.bio ?? "subfrost author profile.",
      section: "Authors",
      href: localizeHref(`/authors/${article.author.id}`, locale),
      keywords: `writer editorial profile ${article.title} ${article.tags.map((tag) => tag.name).join(" ")}`,
      priority: 2,
    })),
  ]
}

export async function searchSite(opts: {
  query: string
  locale?: CmsLocale
  previewFallback?: boolean
  limit?: number
}) {
  const query = opts.query.trim()
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 20)
  const index = await buildSiteSearchIndex({
    locale: opts.locale ?? "en",
    previewFallback: opts.previewFallback,
  })

  if (!query) {
    return index
      .filter((entry) => ["home", "markets", "swap", "vaults", "developer", "docs"].includes(entry.id))
      .slice(0, limit)
      .map(({ keywords: _keywords, priority: _priority, ...result }) => result)
  }

  const terms = tokenize(query)
  const seen = new Set<string>()
  return index
    .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .filter(({ entry }) => {
      if (seen.has(entry.id)) return false
      seen.add(entry.id)
      return true
    })
    .slice(0, limit)
    .map(({ entry }) => {
      const { keywords: _keywords, priority: _priority, ...result } = entry
      return result
    })
}
