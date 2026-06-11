import { NextRequest, NextResponse } from "next/server"
import { getPublishedArticle, type CmsLocale } from "@/lib/cms/articles"

export const dynamic = "force-dynamic"

// GET /api/articles/:slug?locale=en  → full article (markdown body included).
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const locale: CmsLocale = req.nextUrl.searchParams.get("locale") === "zh" ? "zh" : "en"
  const article = await getPublishedArticle(slug, locale)
  if (!article) return NextResponse.json({ error: "not_found" }, { status: 404 })
  return NextResponse.json(
    { article },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  )
}
