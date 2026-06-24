import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"
import { audit } from "@/lib/cms/audit"
import { canManageRole, type Role } from "@/lib/cms/privileges"
import {
  requireScope,
  requireGrantable,
  readJson,
  ok,
  fail,
  guard,
} from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ROLES: Role[] = ["ADMIN", "EDITOR", "AUTHOR", "STAFF"]

// GET /api/v1/users — list users (scope: iam.list_users)
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "iam.list_users")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true, email: true, name: true, role: true, active: true,
        privileges: true, totpEnabled: true, lastSeenAt: true, createdAt: true,
      },
    })
    return ok({ count: users.length, users })
  })
}

// POST /api/v1/users — create a user (scope: iam.create_user).
// With `password` → created directly. Without → a temp password is generated
// and returned once (GSuite-style provisioning).
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "iam.create_user")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<{
      email?: string; name?: string; password?: string; role?: string; privileges?: string[]
    }>(req)
    if (body instanceof NextResponse) return body

    const email = String(body.email ?? "").trim().toLowerCase()
    if (!email || !email.includes("@")) return fail("A valid email is required", 400)
    const role = (body.role ?? "AUTHOR") as Role
    if (!ROLES.includes(role)) return fail(`role must be one of ${ROLES.join(", ")}`, 400)
    const privileges = Array.isArray(body.privileges) ? body.privileges : []

    if (!canManageRole(actor.role, role)) {
      return fail("You cannot create a user at or above your own role", 403)
    }
    const grant = requireGrantable(actor, privileges)
    if (grant) return grant
    if (await prisma.user.findUnique({ where: { email } })) {
      return fail("A user with that email already exists", 409)
    }

    let password = body.password
    let generated: string | undefined
    if (!password) {
      generated = `Sub-${randomBytes(18).toString("base64url")}`
      password = generated
    } else if (password.length < 8) {
      return fail("Password must be at least 8 characters", 400)
    }

    const u = await prisma.user.create({
      data: {
        email, name: body.name?.trim() || null,
        passwordHash: await bcrypt.hash(password, 12), role, privileges,
      },
      select: { id: true, email: true, name: true, role: true, active: true },
    })
    await audit("create_user", { actorId: actor.id, target: u.email, details: { role, privileges } })
    return ok(generated ? { ...u, tempPassword: generated } : u, 201)
  })
}
