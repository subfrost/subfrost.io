import { NextRequest, NextResponse } from "next/server"
import { searchSite } from "@/lib/site-search"
import { shouldUseArticlePreviewFallback } from "@/lib/seo"
import type { CmsLocale } from "@/lib/cms/articles"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const query = params.get("q") ?? ""
  const locale: CmsLocale = params.get("lang") === "zh" ? "zh" : "en"
  const limit = Number(params.get("limit") ?? 10)
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  const results = await searchSite({
    query,
    locale,
    limit: Number.isFinite(limit) ? limit : 10,
    previewFallback: shouldUseArticlePreviewFallback(host),
  })

  return NextResponse.json(
    {
      query,
      locale,
      results,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=300",
      },
    },
  )
}
