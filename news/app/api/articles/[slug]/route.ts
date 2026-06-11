import { NextRequest } from "next/server"
import { getPublishedArticle } from "@/lib/articles"
import { jsonWithCors, preflight } from "@/lib/cors"

// Public single-article fetch (includes markdown body).
//   GET /api/articles/:slug
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const origin = req.headers.get("origin")
  const article = await getPublishedArticle(params.slug)
  if (!article) {
    return jsonWithCors({ error: "not_found" }, origin, { status: 404 })
  }
  return jsonWithCors({ article }, origin, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  })
}

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"))
}
