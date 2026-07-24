import { NextRequest, NextResponse } from "next/server"
import { requireAdminSecret } from "@/lib/api/service-key"
import prisma from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function authorize(request: NextRequest): NextResponse | null {
  // 7-24 audit: constant-time compare via the shared guard (was a plain `!==`).
  return requireAdminSecret(request)
}

async function check(name: string, fn: () => Promise<unknown>) {
  try {
    await fn()
    return { name, ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return { name, ok: false, error: message }
  }
}

export async function GET(request: NextRequest) {
  const denied = authorize(request)
  if (denied) return denied

  const env = {
    databaseUrl: Boolean(process.env.DATABASE_URL),
    authSecret: Boolean(process.env.AUTH_SECRET),
    adminSecret: Boolean(process.env.ADMIN_SECRET),
    cmsBaseUrl: Boolean(process.env.CMS_BASE_URL),
  }

  const checks = await Promise.all([
    check("user", () => prisma.user.count()),
    check("session", () => prisma.session.count()),
    check("auditLog", () => prisma.auditLog.count()),
    check("article", () => prisma.article.count()),
    check("product", () => prisma.product.count()),
    check("initiative", () => prisma.initiative.count()),
    check("task", () => prisma.task.count()),
    check("taskComment", () => prisma.taskComment.count()),
  ])

  const ok =
    env.databaseUrl &&
    env.authSecret &&
    env.adminSecret &&
    checks.every((item) => item.ok)

  return NextResponse.json(
    {
      ok,
      env,
      checks,
      checkedAt: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  )
}
