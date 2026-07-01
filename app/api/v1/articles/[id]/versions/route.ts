import { NextRequest, NextResponse } from "next/server"
import { requireScope, ok, guard } from "@/lib/cms/api-route"
import { listVersions } from "@/lib/cms/article-versions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Locale = "en" | "zh"

// GET /api/v1/articles/:id/versions?locale=en — the lifecycle version chain.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, null)
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    const url = new URL(req.url)
    const locale: Locale = url.searchParams.get("locale") === "zh" ? "zh" : "en"
    const versions = await listVersions(id, locale)
    return ok({ count: versions.length, versions })
  })
}
