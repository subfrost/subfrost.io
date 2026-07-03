import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { getAuthorArticles, getAuthorProfile, type CmsLocale } from "@/lib/cms/articles"
import { shouldUseArticlePreviewFallback } from "@/lib/seo"

export const dynamic = "force-dynamic"

// GET /api/authors/:id?locale=en -> public author profile plus published posts.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const locale: CmsLocale = req.nextUrl.searchParams.get("locale") === "zh" ? "zh" : "en"
  const requestHeaders = await headers()
  const previewFallback = shouldUseArticlePreviewFallback(requestHeaders.get("host"))

  const author = await getAuthorProfile(id, { previewFallback }).catch(() => null)
  if (!author) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const articles = await getAuthorArticles(id, locale, { previewFallback }).catch(() => [])

  return NextResponse.json(
    { author, articles },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  )
}
