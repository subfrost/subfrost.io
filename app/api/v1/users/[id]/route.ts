import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { audit } from "@/lib/cms/audit"
import { revokeAllUserSessions } from "@/lib/cms/session-store"
import { canManageRole, type Role } from "@/lib/cms/privileges"
import {
  requireScope,
  requireOutranks,
  requireGrantable,
  readJson,
  ok,
  fail,
  guard,
  type KeyActor,
} from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ROLES: Role[] = ["ADMIN", "EDITOR", "AUTHOR", "STAFF"]

/** Load the target + enforce the actor outranks it (ADMIN may manage peers).
 *  Returns the target row or a NextResponse to return. */
async function manageableTarget(actor: KeyActor, userId: string) {
  if (userId === actor.id) return fail("Use the account endpoints for self-service changes", 400)
  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target) return fail("User not found", 404)
  const guardResp = requireOutranks(actor, target.role as Role)
  if (guardResp) return guardResp
  return target
}

async function isLastActiveAdmin(target: { role: string }): Promise<boolean> {
  if (target.role !== "ADMIN") return false
  return (await prisma.user.count({ where: { role: "ADMIN", active: true } })) <= 1
}

// GET /api/v1/users/:id
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "iam.list_users")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    const u = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, role: true, active: true, privileges: true,
        totpEnabled: true, lastSeenAt: true, createdAt: true, bio: true, twitter: true, status: true,
      },
    })
    if (!u) return fail("User not found", 404)
    return ok(u)
  })
}

// PATCH /api/v1/users/:id — name/role/privileges/active (mirrors updateUser).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "iam.modify_user")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    const body = await readJson<{
      name?: string | null; role?: string; privileges?: string[]; active?: boolean
    }>(req)
    if (body instanceof NextResponse) return body

    const target = await manageableTarget(actor, id)
    if (target instanceof NextResponse) return target

    const changesRolePriv = body.role !== undefined || body.privileges !== undefined
    if (changesRolePriv && !actor.privileges.includes("iam.manage_roles")) {
      return fail("Changing roles or privileges requires iam.manage_roles", 403)
    }
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role as Role)) return fail(`role must be one of ${ROLES.join(", ")}`, 400)
      if (!canManageRole(actor.role, body.role as Role)) {
        return fail("You cannot assign a role at or above your own", 403)
      }
    }
    if (body.privileges !== undefined) {
      const grant = requireGrantable(actor, body.privileges)
      if (grant) return grant
    }

    const demoting = body.role !== undefined && body.role !== "ADMIN" && target.role === "ADMIN"
    const deactivating = body.active === false && target.role === "ADMIN"
    if ((demoting || deactivating) && (await isLastActiveAdmin(target))) {
      return fail("Cannot remove the last active admin", 409)
    }

    const data: Prisma.UserUpdateInput = {}
    if (body.name !== undefined) data.name = body.name
    if (body.role !== undefined) data.role = body.role as Role
    if (body.privileges !== undefined) data.privileges = body.privileges
    if (body.active !== undefined) data.active = body.active
    if (Object.keys(data).length === 0) return ok({ ok: true, unchanged: true })

    await prisma.user.update({ where: { id }, data })
    if (body.active === false || changesRolePriv) await revokeAllUserSessions(id)
    await audit("update_user", { actorId: actor.id, target: target.email, details: data as Prisma.InputJsonValue })
    return ok({ ok: true })
  })
}

// DELETE /api/v1/users/:id (mirrors deleteUser; blocks last admin).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "iam.delete_user")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    const target = await manageableTarget(actor, id)
    if (target instanceof NextResponse) return target
    if (await isLastActiveAdmin(target)) return fail("Cannot delete the last active admin", 409)
    await prisma.user.delete({ where: { id } })
    await audit("delete_user", { actorId: actor.id, target: target.email })
    return ok({ ok: true, deleted: target.email })
  })
}
