import { NextResponse } from "next/server"
import { getPublishedPreviews } from "@/lib/cms/articles"
import { externalLinks } from "@/lib/external-links"
import { absoluteUrl, articleUrl, authorUrl, siteName, siteUrl } from "@/lib/seo"

export const dynamic = "force-dynamic"

export async function GET() {
  const articles = await getPublishedPreviews({ limit: 10, locale: "en" }).catch(() => [])
  const articleLines = articles
    .map((article) => `- [${article.title}](${articleUrl(article.slug)}): ${article.excerpt}`)
    .join("\n")
  const authorLines = Array.from(
    new Map(articles.map((article) => [article.author.id, article.author])).values(),
  )
    .slice(0, 8)
    .map((author) => `- [${author.name}](${authorUrl(author.id)}): Author profile and published subfrost articles.`)
    .join("\n")

  const body = `# ${siteName}

> Bitcoin-native infrastructure for trading native assets, tracking live BTC markets, and deploying liquidity into AMM pools and vaults on Bitcoin.

## Core Links

- [Website](${siteUrl})
- [Developer](${absoluteUrl("/developer")}): Gateway for technical overview, API docs, protocol references, app entry points, and support.
- [Articles](${absoluteUrl("/articles")}): Research, protocol notes, product updates, and documentation links.
- [Docs](${externalLinks.docs}): Technical references, setup paths, product guides, token docs, and networking references.
- [API Docs](${externalLinks.apiDocs}): API reference for balances, wrapping state, transactions, and integrations.
- [API Login](${externalLinks.apiLogin}): Live API dashboard login.
- [Chrome Extension](${externalLinks.chromeExtension}): Live browser extension download. iOS and Android apps are coming soon.
- [Volume Charts](${absoluteUrl("/volume")}): Protocol wrap and unwrap volume chart surface backed by the volume APIs.
- [Brand Kit](${absoluteUrl("/brand")}): Official subfrost brand guidelines, logo, color, typography, imagery, and downloads.
- [App](https://app.subfrost.io/): Live SUBFROST application.
- [Support](${absoluteUrl("/support")}): Product and account support.

## Latest Articles

${articleLines || "- No published articles returned by the CMS."}

## Author Profiles

${authorLines || "- No author profiles returned by the CMS."}

## Machine-Readable Feeds

- [Article API](${absoluteUrl("/api/articles?limit=12")})
- [Protocol Stats API](${absoluteUrl("/api/stats")}): Homepage market and protocol metrics including BTC/USD, BTC height, Metashrew height, DIESEL, FIRE, total BTC locked, frBTC supply, and lifetime transaction value.
- [Volume Stats API](${absoluteUrl("/api/volume/stats?source=both")}): Wrap and unwrap summary data for both, alkanes, or brc20 sources.
- [Volume Candles API](${absoluteUrl("/api/volume/candles?interval=1d&source=both")}): Time-series wrap and unwrap volume candles.
- [Sitemap](${absoluteUrl("/sitemap.xml")})
- [Robots](${absoluteUrl("/robots.txt")})
`

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  })
}
