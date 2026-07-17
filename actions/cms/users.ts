"use server"

import crypto from "crypto"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { z } from "zod"
import bcrypt from "bcryptjs"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import {
  ALL_PRIVILEGES,
  canManageRole,
  type Privilege,
  type Role,
} from "@/lib/cms/privileges"
import { revokeAllUserSessions } from "@/lib/cms/session-store"
import { sendEmail, onboardingEmail } from "@/lib/cms/email"
import { audit } from "@/lib/cms/audit"

/** Readable, strong temporary password (no ambiguous chars): XXXX-XXXX-XXXX. */
function genTempPassword(): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const group = () =>
    Array.from(crypto.randomBytes(4))
      .map((b) => A[b % A.length])
      .join("")
  return `${group()}-${group()}-${group()}`
}

export type UserActionResult = { ok: true } | { ok: false; error: string }

const ROLES = ["ADMIN", "EDITOR", "AUTHOR", "STAFF"] as const
const privilegeEnum = z.enum(ALL_PRIVILEGES as [Privilege, ...Privilege[]])

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

/** Require a privilege; returns the actor or an error envelope. */
async function actor(
  required: Privilege,
): Promise<{ ok: true; me: CmsUser } | { ok: false; error: string }> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  if (!me.privileges.includes(required)) return { ok: false, error: "Insufficient privileges" }
  return { ok: true, me }
}

type ManageableTarget = Awaited<ReturnType<typeof prisma.user.findUnique>>

/** Load a target the actor is allowed to manage (must strictly outrank, not self).
 *  Exception: ADMIN may manage peer ADMINs to enable trimming (anti-lockout guard is
 *  applied separately in updateUser/deleteUser). */
async function manageable(
  me: CmsUser,
  userId: string,
): Promise<{ ok: true; target: NonNullable<ManageableTarget> } | { ok: false; error: string }> {
  if (userId === me.id) return { ok: false, error: "Use your own profile for self-service changes" }
  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target) return { ok: false, error: "User not found" }
  // ADMIN (top role) may manage peer ADMINs for trim; all other roles use strict rank.
  const allowed = me.role === "ADMIN" || canManageRole(me.role, target.role as Role)
  if (!allowed) {
    return { ok: false, error: "You cannot manage a user at or above your role" }
  }
  return { ok: true, target }
}

/** True if the target is an ADMIN and is the only remaining active ADMIN. */
async function isLastActiveAdmin(target: { id: string; role: string; active?: boolean }): Promise<boolean> {
  if (target.role !== "ADMIN") return false
  const count = await prisma.user.count({ where: { role: "ADMIN", active: true } })
  return count <= 1
}

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional().default(""),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(ROLES).default("AUTHOR"),
  privileges: z.array(privilegeEnum).optional().default([]),
})

export async function createUser(input: z.input<typeof createSchema>): Promise<UserActionResult> {
  const a = await actor("iam.create_user")
  if (!a.ok) return a
  const me = a.me
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { email, name, password, role, privileges } = parsed.data

  if (!canManageRole(me.role, role)) {
    return { ok: false, error: "You cannot create a user at or above your own role" }
  }
  const ungrantable = privileges.filter((p) => !me.privileges.includes(p))
  if (ungrantable.length) {
    return { ok: false, error: `You cannot grant privileges you lack: ${ungrantable.join(", ")}` }
  }
  if (await prisma.user.findUnique({ where: { email: email.toLowerCase() } })) {
    return { ok: false, error: "A user with that email already exists" }
  }

  const u = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name: name || null,
      passwordHash: await bcrypt.hash(password, 12),
      role,
      privileges,
    },
  })
  await audit("create_user", { actorId: me.id, target: u.email, details: { role, privileges }, ip: await ip() })
  revalidatePath("/admin/users")
  return { ok: true }
}

const provisionSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional().default(""),
  role: z.enum(ROLES).default("STAFF"),
  privileges: z.array(privilegeEnum).optional().default([]),
  emailOnboarding: z.boolean().optional().default(false),
})

export type ProvisionResult =
  | { ok: true; tempPassword: string; emailed: boolean }
  | { ok: false; error: string }

/** GSuite-style provisioning: create a user with a generated temporary password
 *  (returned to the admin to share) and optionally email them an onboarding link
 *  carrying that password. Requires iam.create_user. */
export async function provisionUser(input: z.input<typeof provisionSchema>): Promise<ProvisionResult> {
  const a = await actor("iam.create_user")
  if (!a.ok) return a
  const me = a.me
  const parsed = provisionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { email, name, role, privileges, emailOnboarding } = parsed.data

  if (!canManageRole(me.role, role)) {
    return { ok: false, error: "You cannot create a user at or above your own role" }
  }
  const ungrantable = privileges.filter((p) => !me.privileges.includes(p))
  if (ungrantable.length) {
    return { ok: false, error: `You cannot grant privileges you lack: ${ungrantable.join(", ")}` }
  }
  if (await prisma.user.findUnique({ where: { email: email.toLowerCase() } })) {
    return { ok: false, error: "A user with that email already exists" }
  }

  const tempPassword = genTempPassword()
  const u = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name: name || null,
      passwordHash: await bcrypt.hash(tempPassword, 12),
      role,
      privileges,
    },
  })

  let emailed = false
  if (emailOnboarding) {
    const tpl = onboardingEmail(u.name, tempPassword)
    const sent = await sendEmail({ to: u.email, subject: tpl.subject, html: tpl.html })
    emailed = sent.ok && !sent.skipped
  }
  await audit("create_user", { actorId: me.id, target: u.email, details: { role, privileges, emailed }, ip: await ip() })
  revalidatePath("/admin/users")
  return { ok: true, tempPassword, emailed }
}

const updateSchema = z.object({
  name: z.string().max(120).nullable().optional(),
  role: z.enum(ROLES).optional(),
  privileges: z.array(privilegeEnum).optional(),
  active: z.boolean().optional(),
})

/** Rich edit: name/role/privileges/active in one call. Role/privilege changes
 *  additionally require MANAGE_ROLES. */
export async function updateUser(
  userId: string,
  input: z.input<typeof updateSchema>,
): Promise<UserActionResult> {
  const a = await actor("iam.modify_user")
  if (!a.ok) return a
  const me = a.me
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const m = await manageable(me, userId)
  if (!m.ok) return m
  const { name, role, privileges, active } = parsed.data

  const changesRolePriv = role !== undefined || privileges !== undefined
  if (changesRolePriv && !me.privileges.includes("iam.manage_roles")) {
    return { ok: false, error: "Changing roles or privileges requires iam.manage_roles" }
  }
  if (role !== undefined && !canManageRole(me.role, role)) {
    return { ok: false, error: "You cannot assign a role at or above your own" }
  }
  if (privileges !== undefined) {
    const ungrantable = privileges.filter((p) => !me.privileges.includes(p))
    if (ungrantable.length) {
      return { ok: false, error: `You cannot grant privileges you lack: ${ungrantable.join(", ")}` }
    }
  }

  const demoting = role !== undefined && role !== "ADMIN" && (m.target.role as Role) === "ADMIN"
  const deactivating = active === false && (m.target.role as Role) === "ADMIN"
  if ((demoting || deactivating) && (await isLastActiveAdmin(m.target))) {
    return { ok: false, error: "Cannot remove the last active admin" }
  }

  const data: Prisma.UserUpdateInput = {}
  if (name !== undefined) data.name = name
  if (role !== undefined) data.role = role
  if (privileges !== undefined) data.privileges = privileges
  if (active !== undefined) data.active = active
  if (Object.keys(data).length === 0) return { ok: true }

  await prisma.user.update({ where: { id: userId }, data })
  // Deactivation or de-privileging should drop live sessions immediately.
  if (active === false || changesRolePriv) await revokeAllUserSessions(userId)
  await audit("update_user", { actorId: me.id, target: m.target.email, details: data as Prisma.InputJsonValue, ip: await ip() })
  revalidatePath("/admin/users")
  return { ok: true }
}

// Granular helpers retained for the inline table controls.
export async function setUserRole(userId: string, role: Role): Promise<UserActionResult> {
  return updateUser(userId, { role })
}
export async function setUserActive(userId: string, active: boolean): Promise<UserActionResult> {
  return updateUser(userId, { active })
}
export async function setUserPrivileges(userId: string, privileges: Privilege[]): Promise<UserActionResult> {
  return updateUser(userId, { privileges })
}

export async function resetPassword(userId: string, password: string): Promise<UserActionResult> {
  const a = await actor("iam.modify_user")
  if (!a.ok) return a
  const me = a.me
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters" }
  const m = await manageable(me, userId)
  if (!m.ok) return m
  await prisma.user.update({
    where: { id: userId },
    // Bump tokenVersion so all of the target's existing JWTs are invalidated.
    data: { passwordHash: await bcrypt.hash(password, 12), tokenVersion: { increment: 1 } },
  })
  await revokeAllUserSessions(userId)
  await audit("reset_password", { actorId: me.id, target: m.target.email, ip: await ip() })
  return { ok: true }
}

/** Hard-delete a user when safe; otherwise instruct the admin to reassign/deactivate. */
export async function deleteUser(userId: string): Promise<UserActionResult> {
  const a = await actor("iam.delete_user")
  if (!a.ok) return a
  const me = a.me
  const m = await manageable(me, userId)
  if (!m.ok) return m

  if (await isLastActiveAdmin(m.target)) {
    return { ok: false, error: "Cannot delete the last active admin" }
  }

  const articleCount = await prisma.article.count({ where: { authorId: userId } })
  if (articleCount > 0) {
    return {
      ok: false,
      error: `User authored ${articleCount} article(s). Reassign them or deactivate the user instead.`,
    }
  }
  // Sessions + recovery codes cascade; api keys + revision links must go first.
  await prisma.$transaction([
    prisma.apiKey.deleteMany({ where: { userId } }),
    prisma.revision.updateMany({ where: { editorId: userId }, data: { editorId: null } }),
    prisma.user.delete({ where: { id: userId } }),
  ])
  await audit("delete_user", { actorId: me.id, target: m.target.email, ip: await ip() })
  revalidatePath("/admin/users")
  return { ok: true }
}

// --- Self-service author profile (bio/avatar/twitter/status) ---------------

const profileSchema = z.object({
  name: z.string().max(120).optional(),
  bio: z.string().max(500).optional(),
  twitter: z.string().max(80).optional(),
  status: z.string().max(140).optional(),
  avatarUrl: z.string().url().optional().or(z.literal("")),
})

/** A user edits their own author profile; users with MANAGE_USERS may edit anyone's.
 *  Bio/twitter/avatar (the public author byline) require the EDIT_BIO privilege. */
export async function updateProfile(
  userId: string,
  input: z.input<typeof profileSchema>,
): Promise<UserActionResult> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  const isSelf = me.id === userId
  if (!isSelf && !me.privileges.includes("iam.modify_user")) {
    return { ok: false, error: "Not allowed" }
  }
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const d = parsed.data

  // Public byline fields are gated behind the editor capability.
  const wantsByline =
    d.bio !== undefined || d.twitter !== undefined || d.avatarUrl !== undefined
  const canByline = me.privileges.includes("articles.edit_bio") || me.privileges.includes("iam.modify_user")
  if (wantsByline && !canByline) {
    return { ok: false, error: "Editing your public profile requires editor privileges" }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.status !== undefined ? { status: d.status || null } : {}),
      ...(canByline && d.bio !== undefined ? { bio: d.bio } : {}),
      ...(canByline && d.twitter !== undefined ? { twitter: d.twitter } : {}),
      ...(canByline && d.avatarUrl !== undefined ? { avatarUrl: d.avatarUrl || null } : {}),
    },
  })
  revalidatePath("/admin/users")
  revalidatePath("/admin/profile")
  revalidatePath("/articles")
  revalidatePath(`/authors/${userId}`)
  return { ok: true }
}
