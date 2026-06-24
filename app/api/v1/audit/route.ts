import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/audit — read the audit log (scope: audit.view).
// Query: ?limit (default 100, max 500) ?action (exact action filter).
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "audit.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const sp = req.nextUrl.searchParams
    const rawLimit = Number(sp.get("limit"))
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(500, Math.trunc(rawLimit)) : 100
    const action = sp.get("action")?.trim() || undefined

    const entries = await prisma.auditLog.findMany({
      where: action ? { action } : undefined,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { email: true } } },
    })
    return ok({
      count: entries.length,
      entries: entries.map((r) => ({
        id: r.id,
        action: r.action,
        actorEmail: r.actor?.email ?? null,
        target: r.target,
        details: r.details,
        ip: r.ip,
        createdAt: r.createdAt,
      })),
    })
  })
}
