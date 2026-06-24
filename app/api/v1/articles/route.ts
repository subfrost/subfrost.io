import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/articles — list articles (any signed-in key).
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, null)
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const articles = await prisma.article.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        slug: true,
        status: true,
        primaryLocale: true,
        featured: true,
        updatedAt: true,
        author: { select: { id: true, name: true, email: true } },
      },
    })
    return ok({ count: articles.length, articles })
  })
}
