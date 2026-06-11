import { NextRequest } from "next/server"
import { getPublishedPreviews } from "@/lib/articles"
import { jsonWithCors, preflight } from "@/lib/cors"

// Public preview feed consumed by subfrost.io homepage.
//   GET /api/articles?limit=3&featured=true&tag=frbtc
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin")
  const sp = req.nextUrl.searchParams
  const limit = Number(sp.get("limit") ?? "12")
  const tag = sp.get("tag") ?? undefined
  const featured = sp.get("featured") === "true" || undefined

  const articles = await getPublishedPreviews({
    limit: Number.isFinite(limit) ? limit : 12,
    tag,
    featured,
  })

  return jsonWithCors({ articles }, origin, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  })
}

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"))
}
