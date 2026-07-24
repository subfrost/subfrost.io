/**
 * Maintenance endpoint for bootstrapping / resetting CMS accounts WITHOUT a
 * browser session — gated by the shared `x-admin-secret` (same scheme as the
 * other /api/admin/* routes). Lets the team provision the `admin@subfrost.io`
 * superuser and limited EDITOR accounts fully from the CLI, with no gcloud /
 * direct DB access. Once the superuser exists, day-to-day account management
 * happens in /admin/users — nobody needs to call this in the general case.
 *
 * POST  /api/admin/users   (upsert by email — create new, or reset an existing
 *                           account's password/role/name/active)
 *   curl -X POST https://subfrost.io/api/admin/users \
 *     -H "x-admin-secret: $ADMIN_SECRET" -H "content-type: application/json" \
 *     -d '{"email":"admin@subfrost.io","password":"<strong>","role":"ADMIN"}'
 *
 * GET   /api/admin/users   (list accounts: id, email, name, role, active)
 *   curl https://subfrost.io/api/admin/users -H "x-admin-secret: $ADMIN_SECRET"
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdminSecret } from "@/lib/api/service-key"
import { z } from "zod"
import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"

export const runtime = "nodejs" // bcrypt + prisma need the Node runtime
export const dynamic = "force-dynamic"

// Returns a NextResponse to short-circuit on failure, or null when authorized.
function authorize(request: NextRequest): NextResponse | null {
  // 7-24 audit: constant-time compare via the shared guard (was a plain `!==`).
  return requireAdminSecret(request)
}

const bodySchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  role: z.enum(["ADMIN", "EDITOR", "AUTHOR", "STAFF"]).optional(),
  active: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const denied = authorize(request)
  if (denied) return denied

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const { email: rawEmail, name, password, role, active } = parsed.data
  const email = rawEmail.toLowerCase()

  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing) {
    const data: Record<string, unknown> = {}
    if (name !== undefined) data.name = name || null
    if (role !== undefined) data.role = role
    if (active !== undefined) data.active = active
    if (password !== undefined) data.passwordHash = await bcrypt.hash(password, 12)
    const u = await prisma.user.update({ where: { email }, data })
    return NextResponse.json({
      ok: true,
      created: false,
      user: { id: u.id, email: u.email, name: u.name, role: u.role, active: u.active },
    })
  }

  // Creating a brand-new account requires a password.
  if (!password) {
    return NextResponse.json({ error: "password is required to create a new user" }, { status: 400 })
  }
  const u = await prisma.user.create({
    data: {
      email,
      name: name || null,
      passwordHash: await bcrypt.hash(password, 12),
      role: role ?? "AUTHOR",
      active: active ?? true,
    },
  })
  return NextResponse.json(
    {
      ok: true,
      created: true,
      user: { id: u.id, email: u.email, name: u.name, role: u.role, active: u.active },
    },
    { status: 201 },
  )
}

export async function GET(request: NextRequest) {
  const denied = authorize(request)
  if (denied) return denied

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
  })
  return NextResponse.json({ ok: true, count: users.length, users })
}
