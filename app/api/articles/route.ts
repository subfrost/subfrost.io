import { NextRequest, NextResponse } from "next/server"
import { getPublishedPreviews, type CmsLocale } from "@/lib/cms/articles"

export const dynamic = "force-dynamic"

// Public preview feed (consumed by the homepage widget + anyone).
//   GET /api/articles?limit=3&featured=true&tag=frbtc&locale=en
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const limit = Number(sp.get("limit") ?? "12")
  const tag = sp.get("tag") ?? undefined
  const featured = sp.get("featured") === "true" || undefined
  const locale: CmsLocale = sp.get("locale") === "zh" ? "zh" : "en"

  const articles = await getPublishedPreviews({
    limit: Number.isFinite(limit) ? limit : 12,
    tag,
    featured,
    locale,
  })

  return NextResponse.json(
    { articles },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  )
}
