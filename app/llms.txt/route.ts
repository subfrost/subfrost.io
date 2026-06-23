import { NextResponse } from "next/server"
import { getPublishedPreviews } from "@/lib/cms/articles"
import { absoluteUrl, articleUrl, siteName, siteUrl } from "@/lib/seo"

export const dynamic = "force-dynamic"

export async function GET() {
  const articles = await getPublishedPreviews({ limit: 10, locale: "en" }).catch(() => [])
  const articleLines = articles
    .map((article) => `- [${article.title}](${articleUrl(article.slug)}): ${article.excerpt}`)
    .join("\n")

  const body = `# ${siteName}

> Bitcoin-native Layer 0 infrastructure and self-custodial wallet surface for native BTC, frBTC, alkanes, and Bitcoin DeFi.

## Core Links

- [Website](${siteUrl})
- [Blog](${absoluteUrl("/articles")}): Research, protocol notes, product updates, and documentation links.
- [Docs](https://docs.subfrost.io/): Technical references and setup paths.
- [App](https://app.subfrost.io/): Live SUBFROST application.
- [Support](${absoluteUrl("/support")}): Product and account support.

## Latest Articles

${articleLines || "- No published articles returned by the CMS."}

## Machine-Readable Feeds

- [Article API](${absoluteUrl("/api/articles?limit=12")})
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
